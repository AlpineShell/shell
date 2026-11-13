const fs = require('node:fs')
const path = require('node:path')
const { parseManifest } = require('../electron/pluginManifest')
const { hasExport, readModuleExports } = require('./rendererExports')

const EXPORTING_CONTRIBUTIONS = ['topbarWidgets', 'settingsPages']

function appRecord(pluginDir, pluginId) {
  const { ok, record } = parseManifest(pluginDir, pluginId)
  if (!ok) throw new Error(`Alpine Shell would refuse this plugin: ${record.errors.join('; ')}`)
  return record
}

function namedExports(record) {
  return EXPORTING_CONTRIBUTIONS.flatMap((key) =>
    (record.contributes[key] || []).filter((contribution) => contribution.export).map((contribution) => ({ key, name: contribution.export }))
  )
}

function rendererExportsOf(pluginDir, record) {
  const realBase = fs.realpathSync(pluginDir)
  return readModuleExports(fs.realpathSync(path.join(realBase, record.renderer)), realBase)
}

function missingExportProblems(pluginDir, record) {
  const rendererExports = rendererExportsOf(pluginDir, record)
  return namedExports(record)
    .filter(({ name }) => !hasExport(rendererExports, name))
    .map(({ key, name }) => `contributes.${key} names the export "${name}", but the renderer ${record.renderer} has no such export`)
}

function assertAppLoadsPlugin(pluginDir, pluginId) {
  const record = appRecord(pluginDir, pluginId)
  const problems = missingExportProblems(pluginDir, record)
  if (problems.length > 0) throw new Error(problems.join('; '))
}

module.exports = { assertAppLoadsPlugin }
