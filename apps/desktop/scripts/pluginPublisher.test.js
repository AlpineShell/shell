import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { publishBundle } = await import('./pluginPublisher.js')
const { packBundle } = await import('./pluginBundle.js')
const { createStorage } = await import('./pluginStorage.js')

const PLUGIN_ID = 'com.alpine.clock'

let workDir = ''
let pluginDir = ''
let storeDir = ''

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-publisher-'))
  pluginDir = path.join(workDir, PLUGIN_ID)
  storeDir = path.join(workDir, 'store')
  fs.mkdirSync(pluginDir)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(workDir, { recursive: true, force: true })
})

function readStoreJson(key) {
  return JSON.parse(fs.readFileSync(path.join(storeDir, ...key.split('/')), 'utf8'))
}

async function publishFirstParty(manifest) {
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest))
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  const { bundle } = packBundle(pluginDir)
  await publishBundle({ storage: createStorage(storeDir), pluginDir, bundle, manifest, signingKey: privateKey })
}

describe('publishing a first-party plugin', () => {
  it('lists it without a publisher or a community label and keeps its verified flag', async () => {
    await publishFirstParty({ id: PLUGIN_ID, name: 'Clock', version: '1.0.0', verified: true })

    const latest = readStoreJson(`plugins/${PLUGIN_ID}/latest.json`)
    const entry = readStoreJson('plugins/index.json').plugins[0]
    for (const document of [latest, entry]) {
      expect(document.verified).toBe(true)
      expect(document).not.toHaveProperty('publisher')
      expect(document).not.toHaveProperty('community')
    }
  })

  it('never uploads a logo or readme from outside the plugin folder', async () => {
    fs.writeFileSync(path.join(workDir, 'outside.png'), 'secret')
    await publishFirstParty({ id: PLUGIN_ID, name: 'Clock', version: '1.0.0', marketplace: { logo: '../outside.png', readme: '../outside.png' } })

    const latest = readStoreJson(`plugins/${PLUGIN_ID}/latest.json`)
    expect(latest.iconUrl).toBeUndefined()
    expect(latest.readmeUrl).toBeUndefined()
  })
})
