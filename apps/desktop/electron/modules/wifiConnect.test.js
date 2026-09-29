import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process')

const INJECTING_SSID = 'x"&curl 1.2.3.4|cmd&"'
const CMD_SYNTAX_SSID = 'a&calc|b^c>d%PATH%'
const PASSWORD = 'p&ss<wo>rd"\''
const UNESCAPED_AMPERSAND = /&(?!amp;|lt;|gt;|quot;|apos;)/
const SHELL_CAPABLE_RUNNERS = ['exec', 'execSync', 'execFileSync', 'spawn', 'spawnSync']

const calls = []
const shellCapableRunnerCalls = []
let netsh = () => null

for (const runner of SHELL_CAPABLE_RUNNERS) {
  childProcess[runner] = () => {
    shellCapableRunnerCalls.push(runner)
    throw new Error(`child_process.${runner} must not run in this test`)
  }
}

childProcess.execFile = (file, args, options, callback) => {
  const call = { file, args, options }
  const filenameArgument = args.find((argument) => argument.startsWith('filename='))
  if (filenameArgument) {
    call.profilePath = filenameArgument.slice('filename='.length)
    call.profileXml = fs.readFileSync(call.profilePath, 'utf8')
  }
  calls.push(call)
  callback(netsh(args))
}

const { default: wifi } = await import('./wifiConnect.js')

function failFirstConnect() {
  let connectAttempts = 0
  return (args) => {
    if (args[1] !== 'connect') return null
    connectAttempts += 1
    return connectAttempts === 1 ? new Error('no profile') : null
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const call of calls) {
    if (call.profilePath) fs.rmSync(path.dirname(call.profilePath), { recursive: true, force: true })
  }
  const runnersCalled = shellCapableRunnerCalls.splice(0)
  calls.length = 0
  netsh = () => null
  expect(runnersCalled).toEqual([])
})

describe('isConnectableSsid', () => {
  it('accepts ordinary network names', () => {
    for (const ssid of ['Home WiFi', 'B&B Guest', '50% off', 'Café', CMD_SYNTAX_SSID, 'a'.repeat(32)]) {
      expect(wifi.isConnectableSsid(ssid)).toBe(true)
    }
  })

  it('refuses a name with a double quote', () => {
    expect(wifi.isConnectableSsid(INJECTING_SSID)).toBe(false)
  })

  it('refuses control characters and NUL', () => {
    expect(wifi.isConnectableSsid('Cafe\nnext')).toBe(false)
    expect(wifi.isConnectableSsid('Cafe\u0000')).toBe(false)
    expect(wifi.isConnectableSsid('Cafe\u007f')).toBe(false)
  })

  it('refuses names that are empty, not text or longer than 32 bytes', () => {
    expect(wifi.isConnectableSsid('')).toBe(false)
    expect(wifi.isConnectableSsid(undefined)).toBe(false)
    expect(wifi.isConnectableSsid({ toString: () => 'Home' })).toBe(false)
    expect(wifi.isConnectableSsid('a'.repeat(33))).toBe(false)
    expect(wifi.isConnectableSsid('é'.repeat(17))).toBe(false)
  })
})

describe('buildWifiProfileXml', () => {
  it('identifies the network by the hex of its UTF-8 bytes', () => {
    expect(wifi.buildWifiProfileXml('Café', 'password')).toContain('<SSID><hex>436166C3A9</hex>')
  })

  it('escapes the network name and the key', () => {
    const xml = wifi.buildWifiProfileXml('B&B <Guest>', PASSWORD)

    expect(xml).toContain('<name>B&amp;B &lt;Guest&gt;</name>')
    expect(xml).toContain('<keyMaterial>p&amp;ss&lt;wo&gt;rd&quot;&apos;</keyMaterial>')
    expect(xml).not.toContain('<Guest>')
    expect(xml).not.toMatch(UNESCAPED_AMPERSAND)
  })
})

describe('wifiConnect', () => {
  it('refuses a network name that would break out of a command line without running anything', async () => {
    await expect(wifi.wifiConnect(INJECTING_SSID, PASSWORD)).resolves.toEqual({ success: false })
    expect(calls).toHaveLength(0)
  })

  it('hands netsh the network name as one argument with no shell in between', async () => {
    await expect(wifi.wifiConnect(CMD_SYNTAX_SSID)).resolves.toEqual({ success: true })

    expect(calls).toHaveLength(1)
    expect(calls[0].file).toBe(wifi.netshPath())
    expect(path.basename(calls[0].file)).toBe('netsh.exe')
    expect(calls[0].args).toEqual(['wlan', 'connect', `name=${CMD_SYNTAX_SSID}`])
    expect(calls[0].options).toMatchObject({ windowsHide: true })
    expect(calls[0].options.shell).toBeFalsy()
    expect(calls[0].options.timeout).toBeGreaterThan(0)
  })

  it('asks for a password when there is no saved profile', async () => {
    netsh = failFirstConnect()

    await expect(wifi.wifiConnect('Home WiFi')).resolves.toEqual({ success: false, needsPassword: true })
    expect(calls).toHaveLength(1)
  })

  it('adds a profile from a private folder, connects and removes the folder', async () => {
    netsh = failFirstConnect()

    await expect(wifi.wifiConnect('B&B Guest', PASSWORD)).resolves.toEqual({ success: true })

    expect(calls.map((call) => call.args.slice(0, 3))).toEqual([
      ['wlan', 'connect', 'name=B&B Guest'],
      ['wlan', 'add', 'profile'],
      ['wlan', 'connect', 'name=B&B Guest'],
    ])
    const profileDirectory = path.dirname(calls[1].profilePath)
    expect(path.dirname(profileDirectory)).toBe(os.tmpdir())
    expect(path.basename(profileDirectory).startsWith(wifi.PROFILE_DIRECTORY_PREFIX)).toBe(true)
    expect(calls[1].profileXml).toContain('<hex>422642204775657374</hex>')
    expect(calls[1].profileXml).toContain('<name>B&amp;B Guest</name>')
    expect(fs.existsSync(profileDirectory)).toBe(false)
  })

  it('never puts the password on a command line', async () => {
    netsh = failFirstConnect()

    await wifi.wifiConnect('Home WiFi', PASSWORD)

    expect(calls.length).toBeGreaterThan(1)
    expect(calls.every((call) => !call.args.join(' ').includes(PASSWORD))).toBe(true)
  })

  it('reports a failure and removes the folder when the profile is refused', async () => {
    netsh = () => new Error('refused')

    await expect(wifi.wifiConnect('Home WiFi', PASSWORD)).resolves.toEqual({ success: false })

    expect(calls).toHaveLength(2)
    expect(fs.existsSync(path.dirname(calls[1].profilePath))).toBe(false)
  })

  it('reports a failure and removes the folder when the connection is refused', async () => {
    netsh = (args) => (args[1] === 'connect' ? new Error('refused') : null)

    await expect(wifi.wifiConnect('Home WiFi', PASSWORD)).resolves.toEqual({ success: false })

    expect(calls).toHaveLength(3)
    expect(fs.existsSync(path.dirname(calls[1].profilePath))).toBe(false)
  })

  it('still reports a connection that succeeded when the folder cannot be removed', async () => {
    netsh = failFirstConnect()
    const busy = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
    const removeFolder = vi.spyOn(fs.promises, 'rm').mockRejectedValue(busy)

    await expect(wifi.wifiConnect('Home WiFi', PASSWORD)).resolves.toEqual({ success: true })

    expect(calls).toHaveLength(3)
    expect(removeFolder).toHaveBeenCalledWith(path.dirname(calls[1].profilePath), expect.objectContaining({ recursive: true }))
  })
})
