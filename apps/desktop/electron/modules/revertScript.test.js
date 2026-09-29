import { describe, it, expect } from 'vitest'
import revertScript from './revertScript.js'

const {
  buildDelaySeconds,
  buildWaitForProcessExit,
  buildForceProcessExit,
  buildStartExplorer,
  isSafeDeletablePath,
  buildRemoveDirectory,
  buildTemporaryRevertScript,
  buildPermanentRevertScript,
  buildUninstallScript,
} = revertScript

const ALPINE_EXE = 'C:\\Users\\Müller\\AppData\\Local\\Programs\\alpine-shell\\Alpine Shell.exe'
const INSTALL_DIR = 'C:\\Users\\Müller\\AppData\\Local\\Programs\\alpine-shell'
const USER_DATA_DIRS = ['C:\\Users\\Müller\\AppData\\Roaming\\alpine-shell', 'C:\\Users\\Müller\\AppData\\Roaming\\Alpine Shell']
const CACHE_DIRS = ['C:\\Users\\Müller\\AppData\\Local\\alpine-shell-updater']
const UNINSTALLER = `${INSTALL_DIR}\\Uninstall Alpine Shell.exe`
const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const IMAGE = 'Alpine Shell.exe'
const START_EXPLORER = 'Start-Process -FilePath explorer.exe'
const CONSOLE_TOOLS = /\b(tasklist|taskkill|find|findstr|ping|timeout|rd|reg|cmd)(\.exe)?\s/i

function deletionTargets(env) {
  return Object.keys(env)
    .filter(key => key.startsWith('ALPINE_REVERT_DIR_'))
    .sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()))
    .map(key => env[key])
}

function uninstallHelper(overrides = {}) {
  return buildUninstallScript({
    processImageName: IMAGE,
    uninstallerPath: UNINSTALLER,
    installDir: INSTALL_DIR,
    deletableInstallDir: INSTALL_DIR,
    userDataDirs: USER_DATA_DIRS,
    cacheDirs: CACHE_DIRS,
    ...overrides,
  })
}

function allHelpers() {
  return [
    ['temporary', buildTemporaryRevertScript({ processImageName: IMAGE, shellKeyPath: WINLOGON_KEY, shellExePath: ALPINE_EXE })],
    ['permanent', buildPermanentRevertScript({ processImageName: IMAGE })],
    ['uninstall', uninstallHelper()],
  ]
}

describe('buildDelaySeconds', () => {
  it('sleeps inside PowerShell', () => {
    expect(buildDelaySeconds(2)).toBe('Start-Sleep -Seconds 2')
  })

  it('clamps to at least one second', () => {
    expect(buildDelaySeconds(0)).toBe('Start-Sleep -Seconds 1')
  })
})

describe('every helper runs without starting a console program', () => {
  it.each(allHelpers())('%s', (_name, helper) => {
    expect(helper.script).not.toMatch(CONSOLE_TOOLS)
  })
})

describe('buildWaitForProcessExit', () => {
  const lines = buildWaitForProcessExit().join('\n')

  it('looks the process up by name without its extension', () => {
    expect(lines).toContain('GetFileNameWithoutExtension($env:ALPINE_REVERT_IMAGE)')
    expect(lines).toContain('Get-Process -Name $imageName')
  })

  it('distinguishes a real exit from a timeout', () => {
    expect(lines).toContain('if ($waitTicks -ge 60) { $stillRunning = $true; break }')
  })

  it('waits only for Alpine in this Windows session, not for another signed-in user\'s', () => {
    expect(lines).toContain('$sessionId = (Get-Process -Id $PID).SessionId')
    expect(lines).toContain('while (Get-Process -Name $imageName -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $sessionId })')
    expect(lines.indexOf('$sessionId =')).toBeLessThan(lines.indexOf('while ('))
  })
})

describe('buildForceProcessExit', () => {
  const lines = buildForceProcessExit().join('\n')

  it('only stops Alpine in this Windows session', () => {
    expect(lines).toContain('Where-Object { $_.SessionId -eq $sessionId } | Stop-Process -Force')
  })

  it('only forces an exit when the wait timed out', () => {
    expect(buildForceProcessExit()[0]).toBe('if ($stillRunning) {')
    expect(lines).toContain('Stop-Process -Force')
  })

  it('clears the still-running flag once the process is gone', () => {
    expect(lines).toContain('{ $stillRunning = $false }')
  })
})

describe('buildHandBackToExplorer ordering', () => {
  const { script } = buildPermanentRevertScript({ processImageName: IMAGE })

  it('forces the exit before starting Explorer', () => {
    expect(script.indexOf('Stop-Process -Force')).toBeLessThan(script.indexOf(START_EXPLORER))
  })

  it('waits for a voluntary exit before forcing one', () => {
    expect(script.indexOf('while (Get-Process')).toBeLessThan(script.indexOf('Stop-Process -Force'))
  })
})

describe('buildStartExplorer', () => {
  const lines = buildStartExplorer()

  it('starts Explorer unconditionally, because the helper cannot see who owns Shell_TrayWnd', () => {
    expect(lines[0]).toContain(START_EXPLORER)
    expect(lines.join('\n')).not.toContain('explorer -ErrorAction')
  })

  it('starts Explorer outside the install directory so it never holds it open', () => {
    expect(lines[0]).toContain('-WorkingDirectory $env:SystemRoot')
  })

  it('lets the new Explorer settle', () => {
    expect(lines[1]).toBe(buildDelaySeconds(3))
  })
})

describe('every hand-back helper starts Explorer unconditionally', () => {
  it.each(allHelpers())('%s', (_name, helper) => {
    expect(helper.script).toContain(START_EXPLORER)
    expect(helper.script).not.toMatch(/Get-Process -Name explorer/i)
  })
})

describe('every helper leaves the install directory and cleans up after itself', () => {
  it.each(allHelpers())('%s', (_name, helper) => {
    const lines = helper.script.trimEnd().split('\r\n')
    expect(lines[1]).toBe('Set-Location -LiteralPath $env:TEMP')
    expect(lines.at(-1)).toBe('Remove-Item -LiteralPath $PSCommandPath -Force')
  })
})

describe('isSafeDeletablePath', () => {
  it.each([
    ['', 'empty'],
    ['C:\\', 'drive root'],
    ['C:\\Users', 'one component'],
    ['C:\\Users\\test', 'two components'],
    ['alpine-shell', 'relative'],
    ['C:folder\\a\\b\\c', 'drive-relative'],
    ['C:\\Users\\test\\..\\..\\Windows', 'traversal'],
    ['\\\\server\\share\\a', 'UNC with one component below the share'],
  ])('rejects %s (%s)', (value) => {
    expect(isSafeDeletablePath(value)).toBe(false)
  })

  it.each([
    INSTALL_DIR,
    ...USER_DATA_DIRS,
    ...CACHE_DIRS,
    '\\\\fileserver\\profiles\\marc\\AppData\\Roaming\\alpine-shell',
  ])('accepts %s', (value) => {
    expect(isSafeDeletablePath(value)).toBe(true)
  })
})

describe('buildRemoveDirectory', () => {
  const lines = buildRemoveDirectory(0).join('\n')

  it('skips the block when the directory variable is unset', () => {
    expect(buildRemoveDirectory(0)[0]).toBe('if ($env:ALPINE_REVERT_DIR_0) {')
  })

  it('removes by literal path so brackets in a folder name are not wildcards', () => {
    expect(lines).toContain('Remove-Item -LiteralPath $env:ALPINE_REVERT_DIR_0 -Recurse -Force')
  })

  it('bounds the retry loop', () => {
    expect(lines).toContain('$removeTick -lt 30')
  })

  it('reads a distinct variable per directory', () => {
    expect(buildRemoveDirectory(1).join('\n')).toContain('$env:ALPINE_REVERT_DIR_1')
  })
})

describe('path handling is codepage-safe', () => {
  it('keeps non-ASCII paths out of the script body and passes them through the environment', () => {
    for (const [, helper] of allHelpers()) {
      expect(helper.script).toMatch(/^[\x00-\x7F]*$/)
      expect(helper.script).not.toContain('Müller')
    }
  })

  it('carries the real paths in the environment instead', () => {
    expect(buildTemporaryRevertScript({
      processImageName: IMAGE,
      shellKeyPath: WINLOGON_KEY,
      shellExePath: ALPINE_EXE,
    }).env.ALPINE_REVERT_SHELL_EXE).toBe(ALPINE_EXE)
  })
})

describe('buildTemporaryRevertScript', () => {
  const { script, env } = buildTemporaryRevertScript({
    processImageName: IMAGE,
    shellKeyPath: WINLOGON_KEY,
    shellExePath: ALPINE_EXE,
  })

  it('restores the Alpine exe, not explorer.exe, as the shell', () => {
    expect(script).toContain("Set-ItemProperty -LiteralPath ('Registry::' + $env:ALPINE_REVERT_SHELL_KEY) -Name Shell -Value $env:ALPINE_REVERT_SHELL_EXE")
    expect(env.ALPINE_REVERT_SHELL_EXE).toBe(ALPINE_EXE)
    expect(env.ALPINE_REVERT_SHELL_KEY).toBe(WINLOGON_KEY)
  })

  it('waits after Explorer has started so a relaunched Alpine Shell reads the reverted registration', () => {
    const afterExplorer = script.slice(script.indexOf(START_EXPLORER))
    expect(afterExplorer.indexOf(buildDelaySeconds(3))).toBeLessThan(afterExplorer.indexOf('Set-ItemProperty'))
  })

  it('deletes nothing but itself', () => {
    expect(script.match(/Remove-Item/g)).toHaveLength(1)
  })
})

describe('buildPermanentRevertScript', () => {
  const { script } = buildPermanentRevertScript({ processImageName: IMAGE })

  it('never rewrites the shell key back to Alpine', () => {
    expect(script).not.toContain('Set-ItemProperty')
  })

  it('still hands back to Explorer', () => {
    expect(script).toContain(START_EXPLORER)
  })

  it('deletes nothing but itself', () => {
    expect(script.match(/Remove-Item/g)).toHaveLength(1)
  })
})

describe('buildUninstallScript', () => {
  it('runs the NSIS uninstaller in place and waits for it', () => {
    const { script } = uninstallHelper()
    expect(script).toContain("Start-Process -FilePath $env:ALPINE_REVERT_UNINSTALLER -ArgumentList @('/S', ('_?=' + $env:ALPINE_REVERT_INSTALL_DIR))")
    expect(script).toMatch(/ALPINE_REVERT_UNINSTALLER[^\r\n]*-Wait/)
  })

  it('does not pass /currentuser, which this uninstaller never parses', () => {
    expect(uninstallHelper().script).not.toContain('/currentuser')
  })

  it('removes the install directory, both user data directories and the update cache', () => {
    expect(deletionTargets(uninstallHelper().env)).toEqual([INSTALL_DIR, ...USER_DATA_DIRS, ...CACHE_DIRS])
  })

  it('skips the cleanup entirely when Alpine outlived the wait', () => {
    const { script } = uninstallHelper()
    const guard = script.indexOf('if (-not $stillRunning) {')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(script.indexOf('_?='))
    expect(guard).toBeLessThan(script.indexOf('Remove-Item -LiteralPath $env:ALPINE_REVERT_DIR_0'))
  })

  it('never deletes an install directory the caller refused to mark deletable', () => {
    const { env, script } = uninstallHelper({ deletableInstallDir: null })
    expect(deletionTargets(env)).not.toContain(INSTALL_DIR)
    expect(deletionTargets(env)).toEqual([...USER_DATA_DIRS, ...CACHE_DIRS])
    expect(script).toContain('_?=')
  })

  it('emits no uninstaller call when the uninstaller is missing', () => {
    const { script, env } = uninstallHelper({ uninstallerPath: null })
    expect(script).not.toContain('_?=')
    expect(env.ALPINE_REVERT_DIR_0).toBe(INSTALL_DIR)
  })

  it('reports directories it refused to delete instead of dropping them silently', () => {
    const { skippedDirs, env } = uninstallHelper({ userDataDirs: ['C:\\Users'], cacheDirs: [] })
    expect(skippedDirs).toEqual(['C:\\Users'])
    expect(deletionTargets(env)).toEqual([INSTALL_DIR])
  })

  it('waits for Alpine to exit before touching anything', () => {
    const { script } = uninstallHelper()
    expect(script.indexOf('while (Get-Process')).toBeLessThan(script.indexOf('_?='))
  })
})
