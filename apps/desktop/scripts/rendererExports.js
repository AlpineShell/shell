const fs = require('node:fs')
const path = require('node:path')

const RELATIVE_SPECIFIER = /^\.{1,2}\//

function hasModifier(ts, statement, kind) {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
  return Boolean(modifiers?.some((modifier) => modifier.kind === kind))
}

function bindingNames(ts, name) {
  if (ts.isIdentifier(name)) return [name.text]
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(ts, element.name)))
}

function declaredExportNames(ts, statement) {
  if (!hasModifier(ts, statement, ts.SyntaxKind.ExportKeyword)) return []
  if (hasModifier(ts, statement, ts.SyntaxKind.DefaultKeyword)) return ['default']
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) => bindingNames(ts, declaration.name))
  }
  return statement.name && ts.isIdentifier(statement.name) ? [statement.name.text] : []
}

function exportClauseNames(ts, exportClause) {
  if (ts.isNamespaceExport(exportClause)) return [exportClause.name.text]
  return exportClause.elements.map((element) => element.name.text)
}

function parseModule(ts, filePath) {
  return ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
}

function confinedModulePath(realBase, fromFile, specifier) {
  if (!RELATIVE_SPECIFIER.test(specifier)) return null
  let real
  try {
    real = fs.realpathSync(path.resolve(path.dirname(fromFile), specifier))
  } catch {
    return null
  }
  return real.startsWith(realBase + path.sep) && fs.statSync(real).isFile() ? real : null
}

function emptyExports() {
  return { names: new Set(), open: false }
}

function addStarExports(found, starred) {
  for (const name of starred.names) if (name !== 'default') found.names.add(name)
  if (starred.open) found.open = true
}

function collectStarExport(ts, realBase, filePath, statement, visited, found) {
  const specifier = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : ''
  const target = confinedModulePath(realBase, filePath, specifier)
  if (!target) {
    found.open = true
    return
  }
  const starred = emptyExports()
  collectExports(ts, realBase, target, visited, starred)
  addStarExports(found, starred)
}

function statementExportNames(ts, statement) {
  if (ts.isExportAssignment(statement)) return statement.isExportEquals ? [] : ['default']
  if (ts.isExportDeclaration(statement)) return statement.exportClause ? exportClauseNames(ts, statement.exportClause) : []
  return declaredExportNames(ts, statement)
}

function isStarExport(ts, statement) {
  return ts.isExportDeclaration(statement) && !statement.exportClause
}

function collectExports(ts, realBase, filePath, visited, found) {
  if (visited.has(filePath)) return
  visited.add(filePath)
  for (const statement of parseModule(ts, filePath).statements) {
    if (isStarExport(ts, statement)) collectStarExport(ts, realBase, filePath, statement, visited, found)
    else for (const name of statementExportNames(ts, statement)) found.names.add(name)
  }
}

function readModuleExports(filePath, realBase) {
  const ts = require('typescript')
  const found = emptyExports()
  collectExports(ts, realBase, filePath, new Set(), found)
  return found
}

function hasExport(moduleExports, name) {
  return moduleExports.open || moduleExports.names.has(name)
}

module.exports = { hasExport, readModuleExports }
