const PROCESS_WAIT_TICKS = 60
const DIRECTORY_REMOVE_TICKS = 30
const MIN_PATH_COMPONENTS_BELOW_ROOT = 3
const PROCESS_EXIT_SETTLE_SECONDS = 2
const EXPLORER_START_SETTLE_SECONDS = 3
const DIRECTORY_RETRY_SECONDS = 2

const IMAGE_VAR = 'ALPINE_REVERT_IMAGE'
const SHELL_KEY_VAR = 'ALPINE_REVERT_SHELL_KEY'
const SHELL_EXE_VAR = 'ALPINE_REVERT_SHELL_EXE'
const UNINSTALLER_VAR = 'ALPINE_REVERT_UNINSTALLER'
const INSTALL_DIR_VAR = 'ALPINE_REVERT_INSTALL_DIR'

function directoryVar(index) {
  return `ALPINE_REVERT_DIR_${index}`
}

function buildDelaySeconds(seconds) {
  return `Start-Sleep -Seconds ${Math.max(1, Math.round(seconds))}`
}

function buildFindAlpineProcess() {
  return 'Get-Process -Name $imageName -ErrorAction SilentlyContinue'
}

function buildWaitForProcessExit() {
  return [
    `$imageName = [System.IO.Path]::GetFileNameWithoutExtension($env:${IMAGE_VAR})`,
    '$stillRunning = $false',
    '$waitTicks = 0',
    `while (${buildFindAlpineProcess()}) {`,
    '  $waitTicks++',
    `  if ($waitTicks -ge ${PROCESS_WAIT_TICKS}) { $stillRunning = $true; break }`,
    `  ${buildDelaySeconds(1)}`,
    '}',
  ]
}

function buildForceProcessExit() {
  return [
    'if ($stillRunning) {',
    `  ${buildFindAlpineProcess()} | Stop-Process -Force -ErrorAction SilentlyContinue`,
    `  ${buildDelaySeconds(PROCESS_EXIT_SETTLE_SECONDS)}`,
    `  if (-not (${buildFindAlpineProcess()})) { $stillRunning = $false }`,
    '}',
  ]
}

function buildStartExplorer() {
  return [
    'Start-Process -FilePath explorer.exe -WorkingDirectory $env:SystemRoot',
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
  const target = `$env:${directoryVar(index)}`
  return [
    `if (${target}) {`,
    `  for ($removeTick = 0; $removeTick -lt ${DIRECTORY_REMOVE_TICKS}; $removeTick++) {`,
    `    Remove-Item -LiteralPath ${target} -Recurse -Force -ErrorAction SilentlyContinue`,
    `    if (-not (Test-Path -LiteralPath ${target})) { break }`,
    `    ${buildDelaySeconds(DIRECTORY_RETRY_SECONDS)}`,
    '  }',
    '}',
  ]
}

function buildRunUninstaller() {
  return [
    `Start-Process -FilePath $env:${UNINSTALLER_VAR} -ArgumentList @('/S', ('_?=' + $env:${INSTALL_DIR_VAR})) -WorkingDirectory $env:TEMP -Wait`,
  ]
}

function buildScript(lines) {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    'Set-Location -LiteralPath $env:TEMP',
    ...lines,
    'Remove-Item -LiteralPath $PSCommandPath -Force',
    '',
  ].join('\r\n')
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
      `Set-ItemProperty -LiteralPath ('Registry::' + $env:${SHELL_KEY_VAR}) -Name Shell -Value $env:${SHELL_EXE_VAR}`,
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

function buildUninstallScript({ processImageName, uninstallerPath, installDir, deletableInstallDir, userDataDirs, cacheDirs }) {
  const candidates = [deletableInstallDir, ...(userDataDirs || []), ...(cacheDirs || [])].filter(Boolean)
  const removable = candidates.filter(isSafeDeletablePath)
  const skippedDirs = candidates.filter(dirPath => !isSafeDeletablePath(dirPath))

  const env = { [IMAGE_VAR]: processImageName }
  if (uninstallerPath) {
    env[UNINSTALLER_VAR] = uninstallerPath
    env[INSTALL_DIR_VAR] = installDir
  }
  removable.forEach((dirPath, index) => { env[directoryVar(index)] = dirPath })

  const cleanup = [
    ...(uninstallerPath ? buildRunUninstaller() : []),
    ...removable.flatMap((_dirPath, index) => buildRemoveDirectory(index)),
  ]

  return {
    script: buildScript([
      ...buildHandBackToExplorer(),
      ...(cleanup.length ? ['if (-not $stillRunning) {', ...cleanup.map(line => `  ${line}`), '}'] : []),
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
