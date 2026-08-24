const PROCESS_WAIT_TICKS = 60
const DIRECTORY_REMOVE_TICKS = 30
const MIN_PATH_COMPONENTS_BELOW_ROOT = 3
const PROCESS_EXIT_SETTLE_SECONDS = 2
const EXPLORER_START_SETTLE_SECONDS = 3

const IMAGE_VAR = 'ALPINE_REVERT_IMAGE'
const SHELL_KEY_VAR = 'ALPINE_REVERT_SHELL_KEY'
const SHELL_EXE_VAR = 'ALPINE_REVERT_SHELL_EXE'
const UNINSTALLER_VAR = 'ALPINE_REVERT_UNINSTALLER'
const INSTALL_DIR_VAR = 'ALPINE_REVERT_INSTALL_DIR'
const STILL_RUNNING_VAR = 'ALPINE_REVERT_STILL_RUNNING'

function directoryVar(index) {
  return `ALPINE_REVERT_DIR_${index}`
}

function buildDelaySeconds(seconds) {
  return `ping -n ${Math.max(1, Math.round(seconds)) + 1} 127.0.0.1 >nul`
}

function buildWaitForProcessExit() {
  return [
    'set WAITTICKS=0',
    ':alpine_wait_loop',
    `tasklist /nh /fi "imagename eq %${IMAGE_VAR}%" | find /i "%${IMAGE_VAR}%" >nul`,
    'if errorlevel 1 goto alpine_process_gone',
    'set /a WAITTICKS+=1',
    `if %WAITTICKS% GEQ ${PROCESS_WAIT_TICKS} goto alpine_wait_timeout`,
    buildDelaySeconds(1),
    'goto alpine_wait_loop',
    ':alpine_wait_timeout',
    `set ${STILL_RUNNING_VAR}=1`,
    ':alpine_process_gone',
  ]
}

function buildForceProcessExit() {
  return [
    `if not defined ${STILL_RUNNING_VAR} goto alpine_force_done`,
    `taskkill /f /im "%${IMAGE_VAR}%" >nul 2>&1`,
    buildDelaySeconds(PROCESS_EXIT_SETTLE_SECONDS),
    `tasklist /nh /fi "imagename eq %${IMAGE_VAR}%" | find /i "%${IMAGE_VAR}%" >nul`,
    `if errorlevel 1 set "${STILL_RUNNING_VAR}="`,
    ':alpine_force_done',
  ]
}

function buildStartExplorer() {
  return [
    'start "" explorer.exe',
    buildDelaySeconds(EXPLORER_START_SETTLE_SECONDS),
  ]
}

function splitPathComponents(value) {
  const uncMatch = /^\\\\[^\\/]+\\[^\\/]+\\(.*)$/.exec(value)
  if (uncMatch) return uncMatch[1].split(/[\\/]+/).filter(Boolean)
  if (/^[a-zA-Z]:\\/.test(value)) return value.slice(3).split(/[\\/]+/).filter(Boolean)
  return null
}

function isSafeDeletablePath(dirPath) {
  const value = String(dirPath || '')
  const components = splitPathComponents(value)
  if (!components) return false
  if (components.some(part => part === '..' || part === '.')) return false
  return components.length >= MIN_PATH_COMPONENTS_BELOW_ROOT
}

function buildRemoveDirectory(index) {
  const name = directoryVar(index)
  const ref = `"%${name}%"`
  const counter = `RMTICKS${index}`
  return [
    `if not defined ${name} goto alpine_removed_${index}`,
    `set ${counter}=0`,
    `:alpine_remove_${index}`,
    `rd /s /q ${ref}`,
    `if not exist ${ref} goto alpine_removed_${index}`,
    `set /a ${counter}+=1`,
    `if %${counter}% GEQ ${DIRECTORY_REMOVE_TICKS} goto alpine_removed_${index}`,
    buildDelaySeconds(2),
    `goto alpine_remove_${index}`,
    `:alpine_removed_${index}`,
  ]
}

function buildScript(lines) {
  return ['@echo off', 'setlocal', ...lines, 'del "%~f0"', ''].join('\r\n')
}

function buildHandBackToExplorer() {
  return [
    ...buildWaitForProcessExit(),
    ...buildForceProcessExit(),
    buildDelaySeconds(PROCESS_EXIT_SETTLE_SECONDS),
    ...buildStartExplorer(),
  ]
}

function buildTemporaryRevertScript({ processImageName, shellKeyPath, shellExePath }) {
  return {
    script: buildScript([
      ...buildHandBackToExplorer(),
      buildDelaySeconds(EXPLORER_START_SETTLE_SECONDS),
      `reg add "%${SHELL_KEY_VAR}%" /v Shell /t REG_SZ /d "%${SHELL_EXE_VAR}%" /f >nul`,
    ]),
    env: {
      [IMAGE_VAR]: processImageName,
      [SHELL_KEY_VAR]: shellKeyPath,
      [SHELL_EXE_VAR]: shellExePath,
    },
    skippedDirs: [],
  }
}

function buildPermanentRevertScript({ processImageName }) {
  return {
    script: buildScript(buildHandBackToExplorer()),
    env: { [IMAGE_VAR]: processImageName },
    skippedDirs: [],
  }
}

function buildUninstallScript({ processImageName, uninstallerPath, installDir, deletableInstallDir, userDataDirs }) {
  const candidates = [deletableInstallDir, ...(userDataDirs || [])].filter(Boolean)
  const removable = candidates.filter(isSafeDeletablePath)
  const skippedDirs = candidates.filter(dirPath => !isSafeDeletablePath(dirPath))

  const env = { [IMAGE_VAR]: processImageName }
  if (uninstallerPath) {
    env[UNINSTALLER_VAR] = uninstallerPath
    env[INSTALL_DIR_VAR] = installDir
  }
  removable.forEach((dirPath, index) => { env[directoryVar(index)] = dirPath })

  const cleanup = [
    ...(uninstallerPath ? [`"%${UNINSTALLER_VAR}%" /S _?=%${INSTALL_DIR_VAR}%`] : []),
    ...removable.flatMap((_dirPath, index) => buildRemoveDirectory(index)),
  ]

  return {
    script: buildScript([
      ...buildHandBackToExplorer(),
      ...(cleanup.length ? [`if defined ${STILL_RUNNING_VAR} goto alpine_skip_cleanup`, ...cleanup, ':alpine_skip_cleanup'] : []),
    ]),
    env,
    skippedDirs,
  }
}

module.exports = {
  buildDelaySeconds,
  buildWaitForProcessExit,
  buildForceProcessExit,
  buildStartExplorer,
  isSafeDeletablePath,
  buildRemoveDirectory,
  buildTemporaryRevertScript,
  buildPermanentRevertScript,
  buildUninstallScript,
}
