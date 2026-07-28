// Alpine Shell owns the file types its plugins claim. One ProgID per extension points at
// Alpine Shell itself, carries Alpine's icon, and is registered/unregistered by the shell —
// the same ownership model as the alpine-shell:// protocol. A UserChoice written by Windows
// is never touched: it is hash-protected and forging it is both blocked and hostile, so when
// Alpine is not the default the honest move is to send the user to the Default apps page.

const { app, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const APP_NAME = 'Alpine Shell'
const PROG_ID_PREFIX = 'AlpineShell'
const CLASSES_KEY = 'HKCU\\Software\\Classes'
const CAPABILITIES_PATH = 'Software\\Alpine Shell\\Capabilities'
const CAPABILITIES_KEY = `HKCU\\${CAPABILITIES_PATH}`
const REGISTERED_APPLICATIONS_KEY = 'HKCU\\Software\\RegisteredApplications'
const FILE_EXTS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts'
const DEFAULT_APPS_SETTINGS = `ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(APP_NAME)}`
const LEGACY_PROG_IDS = ['AlpineShell.AndroidPackage']
const LEGACY_OPEN_WITH_EXECUTABLES = ['electron.exe', 'openapk.cmd']
const SHCNE_ASSOCCHANGED = 0x08000000
const SHCNF_IDLIST = 0x0000

let changeNotifier = null

function progIdFor(extension) {
  return `${PROG_ID_PREFIX}${extension}`
}

function isOwnProgId(progId) {
  return typeof progId === 'string' && progId.startsWith(`${PROG_ID_PREFIX}.`)
}

function regAdd(keyPath, valueName, value, type = 'REG_SZ') {
  const args = ['add', keyPath]
  if (valueName === null) args.push('/ve')
  else args.push('/v', valueName)
  args.push('/t', type)
  if (value !== undefined) args.push('/d', value)
  args.push('/f')
  execFileSync('reg', args, { windowsHide: true, stdio: 'ignore' })
}

function regDeleteValue(keyPath, valueName) {
  const args = ['delete', keyPath]
  if (valueName === null) args.push('/ve')
  else args.push('/v', valueName)
  args.push('/f')
  execFileSync('reg', args, { windowsHide: true, stdio: 'ignore' })
}

function regDeleteKey(keyPath) {
  execFileSync('reg', ['delete', keyPath, '/f'], { windowsHide: true, stdio: 'ignore' })
}

function regRead(keyPath, valueName) {
  const args = ['query', keyPath]
  if (valueName === null) args.push('/ve')
  else args.push('/v', valueName)
  try {
    const output = execFileSync('reg', args, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const match = String(output).match(/REG_\w+\s+(.*)/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

function regListValues(keyPath) {
  try {
    const output = execFileSync('reg', ['query', keyPath], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const values = []
    for (const line of String(output).split(/\r?\n/)) {
      const match = line.match(/^\s{4}(\S.*?)\s{4}REG_\w+\s*(.*)$/)
      if (match) values.push({ name: match[1].trim(), data: match[2].trim() })
    }
    return values
  } catch {
    return []
  }
}

function quiet(work) {
  try {
    work()
    return true
  } catch {
    return false
  }
}

function launchArguments() {
  if (app.isPackaged) return []
  const entry = process.argv[1]
  return entry ? [path.resolve(entry)] : []
}

function openCommand() {
  return [process.execPath, ...launchArguments(), '%1'].map((part) => `"${part}"`).join(' ')
}

function iconLocation() {
  if (!app.isPackaged) {
    const devIcon = path.join(__dirname, '..', 'build', 'icon.ico')
    if (fs.existsSync(devIcon)) return `"${devIcon}",0`
  }
  return `"${process.execPath}",0`
}

function typeNameFor(extension, requested) {
  if (typeof requested === 'string' && requested) return requested
  return `${extension.slice(1).toUpperCase()} file`
}

function notifyShellOfAssociationChange() {
  if (changeNotifier === null) {
    try {
      const koffi = require('koffi')
      const shell32 = koffi.load('shell32.dll')
      changeNotifier = shell32.func('__stdcall', 'SHChangeNotify', 'void', ['long', 'uint32', 'void *', 'void *'])
    } catch (e) {
      console.error('[file-associations] SHChangeNotify unavailable:', e && e.message)
      changeNotifier = false
    }
  }
  if (!changeNotifier) return
  try {
    changeNotifier(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, null, null)
  } catch (e) {
    console.error('[file-associations] SHChangeNotify failed:', e && e.message)
  }
}

function registerExtension(extension, requestedTypeName) {
  const progId = progIdFor(extension)
  const progIdKey = `${CLASSES_KEY}\\${progId}`
  const typeName = typeNameFor(extension, requestedTypeName)
  regAdd(progIdKey, null, typeName)
  regAdd(progIdKey, 'FriendlyTypeName', typeName)
  regAdd(`${progIdKey}\\DefaultIcon`, null, iconLocation())
  regAdd(`${progIdKey}\\shell\\open`, 'FriendlyAppName', APP_NAME)
  regAdd(`${progIdKey}\\shell\\open\\command`, null, openCommand())
  regAdd(`${CLASSES_KEY}\\${extension}\\OpenWithProgids`, progId, undefined, 'REG_NONE')

  const existingDefault = regRead(`${CLASSES_KEY}\\${extension}`, null)
  if (!existingDefault || isOwnProgId(existingDefault)) {
    regAdd(`${CLASSES_KEY}\\${extension}`, null, progId)
  }
}

function unregisterExtension(extension) {
  const progId = progIdFor(extension)
  quiet(() => regDeleteKey(`${CLASSES_KEY}\\${progId}`))
  quiet(() => regDeleteValue(`${CLASSES_KEY}\\${extension}\\OpenWithProgids`, progId))
  quiet(() => regDeleteValue(`${FILE_EXTS_KEY}\\${extension}\\OpenWithProgids`, progId))
  if (regRead(`${CLASSES_KEY}\\${extension}`, null) === progId) {
    quiet(() => regDeleteValue(`${CLASSES_KEY}\\${extension}`, null))
  }
}

function clearSupersededHandlers(extension) {
  for (const legacyProgId of LEGACY_PROG_IDS) {
    quiet(() => regDeleteKey(`${CLASSES_KEY}\\${legacyProgId}`))
    quiet(() => regDeleteValue(`${CLASSES_KEY}\\${extension}\\OpenWithProgids`, legacyProgId))
    quiet(() => regDeleteValue(`${FILE_EXTS_KEY}\\${extension}\\OpenWithProgids`, legacyProgId))
    if (regRead(`${CLASSES_KEY}\\${extension}`, null) === legacyProgId) {
      quiet(() => regDeleteValue(`${CLASSES_KEY}\\${extension}`, null))
    }
  }
  const openWithListKey = `${FILE_EXTS_KEY}\\${extension}\\OpenWithList`
  const entries = regListValues(openWithListKey)
  const removed = new Set()
  for (const entry of entries) {
    if (entry.name === 'MRUList') continue
    if (!LEGACY_OPEN_WITH_EXECUTABLES.includes(entry.data.toLowerCase())) continue
    if (quiet(() => regDeleteValue(openWithListKey, entry.name))) removed.add(entry.name)
  }
  if (!removed.size) return
  const mruList = entries.find((entry) => entry.name === 'MRUList')
  if (!mruList) return
  const surviving = [...mruList.data].filter((letter) => !removed.has(letter)).join('')
  if (surviving) quiet(() => regAdd(openWithListKey, 'MRUList', surviving))
  else quiet(() => regDeleteValue(openWithListKey, 'MRUList'))
}

function writeCapabilities(extensions) {
  if (!extensions.length) {
    quiet(() => regDeleteValue(REGISTERED_APPLICATIONS_KEY, APP_NAME))
    quiet(() => regDeleteKey(CAPABILITIES_KEY))
    return
  }
  regAdd(CAPABILITIES_KEY, 'ApplicationName', APP_NAME)
  regAdd(CAPABILITIES_KEY, 'ApplicationDescription', 'Opens files handed to Alpine Shell by its plugins.')
  quiet(() => regDeleteKey(`${CAPABILITIES_KEY}\\FileAssociations`))
  for (const extension of extensions) {
    regAdd(`${CAPABILITIES_KEY}\\FileAssociations`, extension, progIdFor(extension))
  }
  regAdd(REGISTERED_APPLICATIONS_KEY, APP_NAME, CAPABILITIES_PATH)
}

function apply(request) {
  const register = Array.isArray(request.register) ? request.register : []
  const unregister = Array.isArray(request.unregister) ? request.unregister : []
  if (!register.length && !unregister.length) return { changed: false }
  for (const extension of unregister) {
    if (!quiet(() => unregisterExtension(extension))) {
      console.error(`[file-associations] could not unregister ${extension}`)
    }
  }
  for (const claim of register) {
    if (!quiet(() => registerExtension(claim.extension, claim.typeName))) {
      console.error(`[file-associations] could not register ${claim.extension}`)
      continue
    }
    clearSupersededHandlers(claim.extension)
  }
  quiet(() => writeCapabilities(register.map((claim) => claim.extension)))
  notifyShellOfAssociationChange()
  return { changed: true }
}

function defaultState(extension) {
  const progId = progIdFor(extension)
  const userChoice = regRead(`${FILE_EXTS_KEY}\\${extension}\\UserChoice`, 'ProgId')
  if (userChoice) return { extension, progId, holder: userChoice, isDefault: userChoice === progId }
  const classDefault = regRead(`${CLASSES_KEY}\\${extension}`, null)
  return { extension, progId, holder: classDefault, isDefault: classDefault === progId }
}

function openDefaultAppsSettings() {
  return shell.openExternal(DEFAULT_APPS_SETTINGS)
}

module.exports = { apply, defaultState, openDefaultAppsSettings, progIdFor }
