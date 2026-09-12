const fs = require('fs')
const path = require('path')

function appendBounded(entries, entry, maxEntries) {
  return [...entries, entry].slice(-maxEntries)
}

function userDataDirectory() {
  const { app } = require('electron')
  return app.getPath('userData')
}

function readEntries(filePath, fileSystem) {
  try {
    const parsed = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function createDiagnosticLog({ fileName, maxEntries, resolveDirectory = userDataDirectory, fileSystem = fs, clock = Date.now }) {
  let entries = null
  let filePath = null

  function location() {
    if (!filePath) filePath = path.join(resolveDirectory(), fileName)
    return filePath
  }

  function record(kind, detail) {
    try {
      const target = location()
      if (!entries) entries = readEntries(target, fileSystem)
      entries = appendBounded(entries, { time: clock(), kind, detail: detail ?? null }, maxEntries)
      fileSystem.writeFileSync(target, JSON.stringify(entries, null, 2))
    } catch (e) {
      console.error('[diagnosticLog] write failed:', e?.message ?? e)
    }
  }

  return { record }
}

function createFailureReporter({ record, prefix }) {
  const active = new Set()
  return {
    failure(kind, detail) {
      if (active.has(kind)) return
      active.add(kind)
      console.error(`${prefix} ${kind}:`, detail ?? '')
      record(kind, detail)
    },
    success(kind) {
      active.delete(kind)
    },
  }
}

module.exports = { appendBounded, createDiagnosticLog, createFailureReporter }
