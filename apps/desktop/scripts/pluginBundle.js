const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { createZipArchive } = require('./zipArchive')

const PACKAGE_EXT = '.alpineplugin'
const IGNORE_FILE = '.alpineignore'
const SKIP_ENTRIES = new Set(['node_modules', '.git', '.DS_Store'])

function toPosixPath(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function escapeRegExp(text) {
  return text.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

function globToRegExp(glob) {
  const segmentPattern = (part) =>
    part
      .split('*')
      .map((piece) => escapeRegExp(piece).replace(/\?/g, '[^/]'))
      .join('[^/]*')
  return new RegExp(`^${glob.split('**').map(segmentPattern).join('.*')}$`)
}

function pathCandidates(relativePath, anchored) {
  const segments = relativePath.split('/')
  if (!anchored) return segments
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'))
}

function ignoreMatcher(pattern) {
  const trimmed = pattern.replace(/^\/+/, '').replace(/\/+$/, '')
  const anchored = pattern.startsWith('/') || trimmed.includes('/')
  const expression = globToRegExp(trimmed)
  return (relativePath) => pathCandidates(relativePath, anchored).some((candidate) => expression.test(candidate))
}

function parseIgnoreFile(text) {
  const patterns = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const negated = patterns.find((line) => line.startsWith('!'))
  if (negated) throw new Error(`${IGNORE_FILE} does not support negated patterns: ${negated}`)
  return patterns
}

function readIgnorePatterns(root) {
  const ignorePath = path.join(root, IGNORE_FILE)
  if (!fs.existsSync(ignorePath)) return []
  return parseIgnoreFile(fs.readFileSync(ignorePath, 'utf8'))
}

function assertInsideRoot(realRoot, absolutePath) {
  const relative = path.relative(realRoot, fs.realpathSync(absolutePath))
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Entry escapes plugin dir: ${absolutePath}`)
}

function listBundleFiles(root, ignorePatterns = []) {
  const realRoot = fs.realpathSync(root)
  const matchers = ignorePatterns.map(ignoreMatcher)
  const files = []
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      if (SKIP_ENTRIES.has(name) || name.endsWith(PACKAGE_EXT)) continue
      const absolutePath = path.join(dir, name)
      const relativePath = toPosixPath(path.relative(realRoot, absolutePath))
      if (matchers.some((matches) => matches(relativePath))) continue
      const stat = fs.lstatSync(absolutePath)
      if (stat.isSymbolicLink()) throw new Error(`Refusing to pack symlink: ${absolutePath}`)
      assertInsideRoot(realRoot, absolutePath)
      if (stat.isDirectory()) walk(absolutePath)
      else if (stat.isFile()) files.push(relativePath)
    }
  }
  walk(realRoot)
  return files.sort()
}

function packBundle(root, ignorePatterns = []) {
  const realRoot = fs.realpathSync(root)
  const names = listBundleFiles(realRoot, ignorePatterns)
  if (!names.includes('plugin.json')) throw new Error('plugin.json must be at the plugin root')
  const entries = names.map((name) => ({ name, data: fs.readFileSync(path.join(realRoot, name)) }))
  return {
    bundle: createZipArchive(entries),
    files: entries.map(({ name, data }) => ({ path: name, size: data.length })),
  }
}

function sha256(buffer) {
  const digest = crypto.createHash('sha256').update(buffer).digest()
  return { hex: digest.toString('hex'), digest }
}

module.exports = { PACKAGE_EXT, listBundleFiles, packBundle, parseIgnoreFile, readIgnorePatterns, sha256 }
