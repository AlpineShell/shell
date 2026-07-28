import { describe, it, expect } from 'vitest'
import revertScript from './revertScript.js'

const {
  buildDelaySeconds,
  buildWaitForProcessExit,
  buildEnsureExplorerRunning,
  isSafeDeletablePath,
  buildRemoveDirectory,
  buildTemporaryRevertScript,
  buildPermanentRevertScript,
  buildUninstallScript,
} = revertScript

const ALPINE_EXE = 'C:\\Users\\Müller\\AppData\\Local\\Programs\\alpine-shell\\Alpine Shell.exe'
const INSTALL_DIR = 'C:\\Users\\Müller\\AppData\\Local\\Programs\\alpine-shell'
const USER_DATA_DIRS = ['C:\\Users\\Müller\\AppData\\Roaming\\alpine-shell', 'C:\\Users\\Müller\\AppData\\Roaming\\Alpine Shell']
const UNINSTALLER = `${INSTALL_DIR}\\Uninstall Alpine Shell.exe`
const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const IMAGE = 'Alpine Shell.exe'

function deletionTargets(env) {
  return Object.keys(env)
    .filter(key => key.startsWith('ALPINE_REVERT_DIR_'))
    .sort()
    .map(key => env[key])
}

function uninstallHelper(overrides = {}) {
  return buildUninstallScript({
    processImageName: IMAGE,
    uninstallerPath: UNINSTALLER,
    installDir: INSTALL_DIR,
    deletableInstallDir: INSTALL_DIR,
    userDataDirs: USER_DATA_DIRS,
    ...overrides,
  })
}

describe('buildDelaySeconds', () => {
  it('uses ping rather than timeout', () => {
    expect(buildDelaySeconds(2)).toBe('ping -n 3 127.0.0.1 >nul')
  })

  it('never emits timeout, which returns errorlevel 125 under stdio ignore', () => {
    expect(buildDelaySeconds(5)).not.toContain('timeout')
  })

  it('clamps to at least one second', () => {
    expect(buildDelaySeconds(0)).toBe('ping -n 2 127.0.0.1 >nul')
  })
})

describe('buildWaitForProcessExit', () => {
  const lines = buildWaitForProcessExit().join('\n')

  it('distinguishes a real exit from a timeout', () => {
    expect(lines).toContain('if errorlevel 1 goto alpine_process_gone')
    expect(lines).toContain('if %WAITTICKS% GEQ 60 goto alpine_wait_timeout')
  })

  it('records that the process outlived the wait', () => {
    expect(lines).toContain('set ALPINE_REVERT_STILL_RUNNING=1')
  })
})

describe('buildEnsureExplorerRunning', () => {
  it('starts Explorer only when it is absent', () => {
    const lines = buildEnsureExplorerRunning()
    expect(lines.indexOf('if not errorlevel 1 goto alpine_explorer_running')).toBeLessThan(
      lines.indexOf('start "" explorer.exe'),
    )
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
    '\\\\fileserver\\profiles\\marc\\AppData\\Roaming\\alpine-shell',
  ])('accepts %s', (value) => {
    expect(isSafeDeletablePath(value)).toBe(true)
  })
})

describe('buildRemoveDirectory', () => {
  const lines = buildRemoveDirectory(0).join('\n')

  it('skips the block when the directory variable is unset', () => {
    expect(lines).toContain('if not defined ALPINE_REVERT_DIR_0 goto alpine_removed_0')
  })

  it('bounds the retry loop', () => {
    expect(lines).toContain('if %RMTICKS0% GEQ 30 goto alpine_removed_0')
  })

  it('uses a distinct label and counter per directory', () => {
    const combined = [...buildRemoveDirectory(0), ...buildRemoveDirectory(1)].join('\n')
    expect(combined).toContain(':alpine_remove_1')
    expect(combined).toContain('set RMTICKS1=0')
  })
})

describe('path handling is codepage-safe', () => {
  it('keeps non-ASCII paths out of the batch body and passes them through the environment', () => {
    const helpers = [
      buildTemporaryRevertScript({ processImageName: IMAGE, shellKeyPath: WINLOGON_KEY, shellExePath: ALPINE_EXE }),
      buildPermanentRevertScript({ processImageName: IMAGE }),
      uninstallHelper(),
    ]
    for (const helper of helpers) {
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
    expect(script).toContain('reg add "%ALPINE_REVERT_SHELL_KEY%" /v Shell /t REG_SZ /d "%ALPINE_REVERT_SHELL_EXE%" /f')
    expect(env.ALPINE_REVERT_SHELL_EXE).toBe(ALPINE_EXE)
  })

  it('waits for Alpine to exit and starts Explorer before restoring the shell key', () => {
    expect(script.indexOf(':alpine_process_gone')).toBeLessThan(script.indexOf('start "" explorer.exe'))
    expect(script.indexOf('start "" explorer.exe')).toBeLessThan(script.indexOf('reg add'))
  })

  it('deletes nothing', () => {
    expect(script).not.toContain('rd /s /q')
  })

  it('removes itself last', () => {
    expect(script.trimEnd().endsWith('del "%~f0"')).toBe(true)
  })
})

describe('buildPermanentRevertScript', () => {
  const { script } = buildPermanentRevertScript({ processImageName: IMAGE })

  it('never rewrites the shell key back to Alpine', () => {
    expect(script).not.toContain('reg add')
  })

  it('still hands back to Explorer', () => {
    expect(script).toContain('start "" explorer.exe')
  })

  it('deletes nothing', () => {
    expect(script).not.toContain('rd /s /q')
  })
})

describe('buildUninstallScript', () => {
  it('runs the NSIS uninstaller in place so cmd waits for it', () => {
    const { script } = uninstallHelper()
    expect(script).toContain('"%ALPINE_REVERT_UNINSTALLER%" /S _?=%ALPINE_REVERT_INSTALL_DIR%')
  })

  it('does not pass /currentuser, which this uninstaller never parses', () => {
    expect(uninstallHelper().script).not.toContain('/currentuser')
  })

  it('removes the install directory itself, since _?= leaves it behind', () => {
    const { env } = uninstallHelper()
    expect(env.ALPINE_REVERT_DIR_0).toBe(INSTALL_DIR)
  })

  it('removes both user data directories', () => {
    const { env } = uninstallHelper()
    expect([env.ALPINE_REVERT_DIR_1, env.ALPINE_REVERT_DIR_2]).toEqual(USER_DATA_DIRS)
  })

  it('skips the cleanup entirely when Alpine outlived the wait', () => {
    const { script } = uninstallHelper()
    const guard = script.indexOf('if defined ALPINE_REVERT_STILL_RUNNING goto alpine_skip_cleanup')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(script.indexOf('_?='))
    expect(guard).toBeLessThan(script.indexOf('rd /s /q'))
    expect(script.indexOf(':alpine_skip_cleanup')).toBeLessThan(script.indexOf('del "%~f0"'))
  })

  it('never deletes an install directory the caller refused to mark deletable', () => {
    const { env, script } = uninstallHelper({ deletableInstallDir: null })
    expect(deletionTargets(env)).not.toContain(INSTALL_DIR)
    expect(deletionTargets(env)).toEqual(USER_DATA_DIRS)
    expect(script).toContain('_?=')
  })

  it('emits no uninstaller call when the uninstaller is missing', () => {
    const { script, env } = uninstallHelper({ uninstallerPath: null })
    expect(script).not.toContain('_?=')
    expect(env.ALPINE_REVERT_DIR_0).toBe(INSTALL_DIR)
  })

  it('reports directories it refused to delete instead of dropping them silently', () => {
    const { skippedDirs, env } = uninstallHelper({ userDataDirs: ['C:\\Users'] })
    expect(skippedDirs).toEqual(['C:\\Users'])
    expect(deletionTargets(env)).toEqual([INSTALL_DIR])
  })

  it('waits for Alpine to exit before touching anything', () => {
    const { script } = uninstallHelper()
    expect(script.indexOf(':alpine_process_gone')).toBeLessThan(script.indexOf('_?='))
  })
})
