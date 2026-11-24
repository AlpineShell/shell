const path = require('path')
const fs = require('fs')
const { execFileSync, execSync } = require('child_process')
const { regListValues } = require('./registryRead')

const CURSOR_KEY = 'HKCU\\Control Panel\\Cursors'
const CURSOR_SCHEME_NAME = 'Alpine Shell'
const LEGACY_CURSOR_DIR_NAME = 'cursors'

const CURSOR_FILES_BY_ROLE = {
  'Arrow': 'Pointer.cur',
  'Help': 'Help.cur',
  'AppStarting': 'Work.ani',
  'Wait': 'Busy.ani',
  'Crosshair': 'Cross.cur',
  'IBeam': 'Text.cur',
  'NWPen': 'Handwriting.cur',
  'No': 'Unavailable.cur',
  'SizeNS': 'Vert.cur',
  'SizeWE': 'Horz.cur',
  'SizeNWSE': 'Dgn1.cur',
  'SizeNESW': 'Dgn2.cur',
  'SizeAll': 'Move.cur',
  'UpArrow': 'Alternate.cur',
  'Hand': 'Link.cur',
  'Pin': 'Pin.cur',
  'Person': 'Person.cur',
}

const CURSOR_ROLES = Object.keys(CURSOR_FILES_BY_ROLE)

function cursorInstallDir(localAppData) {
  return path.join(localAppData, 'Microsoft', 'Windows', 'Cursors', CURSOR_SCHEME_NAME)
}

function legacyCursorDir(userDataDir) {
  return path.join(userDataDir, LEGACY_CURSOR_DIR_NAME)
}

function isInsideDirectory(filePath, directory) {
  if (!filePath) return false
  const relative = path.relative(path.resolve(directory).toLowerCase(), path.resolve(filePath).toLowerCase())
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function planCursorRelocation(cursorValues, legacyDir, installDir) {
  return cursorValues
    .filter((value) => value.name && isInsideDirectory(value.data, legacyDir))
    .map((value) => ({ name: value.name, data: path.join(installDir, path.basename(value.data)) }))
}

function copyCursorFiles(sourceDir, installDir) {
  fs.mkdirSync(installDir, { recursive: true })
  for (const file of fs.readdirSync(sourceDir)) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(installDir, file))
  }
}

function writeCursorValue(name, data) {
  execFileSync('reg', ['add', CURSOR_KEY, '/v', name, '/t', 'REG_SZ', '/d', data, '/f'], { windowsHide: true })
}

function reloadCursors() {
  execSync('rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True', { windowsHide: true })
}

function installCursorScheme({ sourceDir, localAppData }) {
  const installDir = cursorInstallDir(localAppData)
  copyCursorFiles(sourceDir, installDir)

  for (const [role, file] of Object.entries(CURSOR_FILES_BY_ROLE)) {
    const cursorPath = path.join(installDir, file)
    if (fs.existsSync(cursorPath)) writeCursorValue(role, cursorPath)
  }

  writeCursorValue('', CURSOR_SCHEME_NAME)
  reloadCursors()
}

function relocateLegacyCursorScheme({ userDataDir, localAppData }) {
  const legacyDir = legacyCursorDir(userDataDir)
  if (!localAppData || !fs.existsSync(legacyDir)) return false

  const installDir = cursorInstallDir(localAppData)
  const relocation = planCursorRelocation(regListValues(CURSOR_KEY), legacyDir, installDir)

  if (relocation.length > 0) {
    copyCursorFiles(legacyDir, installDir)
    for (const value of relocation) writeCursorValue(value.name, value.data)
    reloadCursors()
  }

  const stillPointingAtLegacy = planCursorRelocation(regListValues(CURSOR_KEY), legacyDir, installDir)
  if (stillPointingAtLegacy.length === 0) fs.rmSync(legacyDir, { recursive: true, force: true })

  return relocation.length > 0
}

function removeCursorFiles({ userDataDir, localAppData }) {
  const directories = [legacyCursorDir(userDataDir)]
  if (localAppData) directories.push(cursorInstallDir(localAppData))
  for (const directory of directories) {
    if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true })
  }
}

module.exports = {
  CURSOR_KEY,
  CURSOR_SCHEME_NAME,
  CURSOR_ROLES,
  cursorInstallDir,
  legacyCursorDir,
  planCursorRelocation,
  installCursorScheme,
  relocateLegacyCursorScheme,
  removeCursorFiles,
}
