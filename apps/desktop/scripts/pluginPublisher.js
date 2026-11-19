const fs = require('node:fs')
const path = require('node:path')
const { PACKAGE_EXT, sha256 } = require('./pluginBundle')
const { signDigest } = require('./pluginSigning')
const { getJson } = require('./pluginStorage')

const CATALOG_KEY = 'plugins/index.json'
const CATALOG_SCHEMA_VERSION = 1
const IMMUTABLE = 'public, max-age=31536000, immutable'
const NO_CACHE = 'no-cache'
const IMAGE_CONTENT_TYPES = { '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const README_IMAGE_CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}
const README_IMAGE_LIMIT = 50
const README_IMAGE_REFERENCE = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)|<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi

const bundleKey = (id, version) => `plugins/${id}/${version}/${id}-${version}${PACKAGE_EXT}`
const latestKey = (id) => `plugins/${id}/latest.json`

function authorName(author) {
  if (!author) return undefined
  if (typeof author === 'string') return author
  return author.name || undefined
}

function confinedAsset(pluginDir, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) return null
  if (relativePath.split(/[\\/]/).includes('..')) return null
  const target = path.join(pluginDir, relativePath)
  if (!fs.existsSync(target) || !fs.lstatSync(target).isFile()) return null
  const realRoot = fs.realpathSync(pluginDir)
  return fs.realpathSync(target).startsWith(realRoot + path.sep) ? target : null
}

function logoPath(pluginDir, manifest) {
  const marketplace = manifest.marketplace || {}
  const iconFile = typeof manifest.icon === 'string' && !manifest.icon.startsWith('lucide:') ? manifest.icon : null
  return confinedAsset(pluginDir, marketplace.logo || iconFile || 'icon.png')
}

async function uploadIcon(storage, pluginDir, manifest) {
  const iconPath = logoPath(pluginDir, manifest)
  if (!iconPath) return undefined
  const ext = (path.extname(iconPath) || '.png').toLowerCase()
  const iconUrl = `plugins/${manifest.id}/icon${ext}`
  await storage.put(iconUrl, fs.readFileSync(iconPath), IMAGE_CONTENT_TYPES[ext] || 'image/png', IMMUTABLE)
  return iconUrl
}

function bundledImagePath(reference) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(reference)) return null
  const relativePath = path.posix.normalize(reference.split(/[?#]/)[0])
  if (relativePath.startsWith('..') || !README_IMAGE_CONTENT_TYPES[path.posix.extname(relativePath).toLowerCase()]) return null
  return relativePath
}

function readmeImagePaths(readmeText) {
  const paths = new Set()
  for (const match of readmeText.matchAll(README_IMAGE_REFERENCE)) {
    const relativePath = bundledImagePath(match[1] || match[2] || match[3])
    if (relativePath) paths.add(relativePath)
  }
  return [...paths].slice(0, README_IMAGE_LIMIT)
}

async function uploadReadmeImages(storage, pluginDir, manifest, readmeText) {
  for (const relativePath of readmeImagePaths(readmeText)) {
    const imagePath = confinedAsset(pluginDir, relativePath)
    if (!imagePath) continue
    const contentType = README_IMAGE_CONTENT_TYPES[path.extname(imagePath).toLowerCase()]
    await storage.put(`plugins/${manifest.id}/${relativePath}`, fs.readFileSync(imagePath), contentType, NO_CACHE)
  }
}

async function uploadReadme(storage, pluginDir, manifest) {
  const readmePath = confinedAsset(pluginDir, (manifest.marketplace || {}).readme)
  if (!readmePath) return { readmeUrl: undefined, readmeText: null }
  const readmeText = fs.readFileSync(readmePath, 'utf8')
  const readmeUrl = `plugins/${manifest.id}/README.md`
  await uploadReadmeImages(storage, pluginDir, manifest, readmeText)
  await storage.put(readmeUrl, Buffer.from(readmeText), 'text/markdown', NO_CACHE)
  return { readmeUrl, readmeText }
}

const OFFICIAL_PUBLISHER_SLUGS = new Set(['alpine', 'alpine-shell', 'alpineshell'])

function isOfficialPublisher(publisher) {
  return Boolean(publisher && OFFICIAL_PUBLISHER_SLUGS.has(publisher.slug))
}

function listingFields(listing) {
  if (!listing) return {}
  const official = isOfficialPublisher(listing.publisher)
  return { verified: official, publisher: listing.publisher, community: !official }
}

function latestDocument(manifest, release, listing) {
  const marketplace = manifest.marketplace || {}
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    id: manifest.id,
    name: marketplace.displayName || manifest.name || manifest.id,
    version: manifest.version,
    description: manifest.description,
    shortDescription: marketplace.shortDescription || manifest.description,
    author: manifest.author,
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    icon: manifest.icon,
    iconUrl: release.iconUrl,
    logo: release.iconUrl,
    category: marketplace.category,
    keywords: marketplace.keywords || [],
    screenshots: marketplace.screenshots || [],
    readme: release.readmeText,
    readmeUrl: release.readmeUrl,
    sha256: release.sha256,
    signature: release.signature,
    size: release.size,
    url: release.url,
    apiVersion: manifest.apiVersion ?? 1,
    engines: manifest.engines,
    verified: manifest.verified === true,
    publishedAt: release.publishedAt,
    ...listingFields(listing),
  }
}

function catalogCard(manifest, release, listing) {
  const marketplace = manifest.marketplace || {}
  return {
    id: manifest.id,
    name: marketplace.displayName || manifest.name || manifest.id,
    version: manifest.version,
    description: manifest.description,
    shortDescription: marketplace.shortDescription || manifest.description,
    author: authorName(manifest.author),
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    apiVersion: manifest.apiVersion ?? 1,
    engines: manifest.engines,
    iconUrl: release.iconUrl,
    logo: release.iconUrl,
    category: marketplace.category,
    keywords: marketplace.keywords || [],
    readmeUrl: release.readmeUrl,
    verified: manifest.verified === true,
    sha256: release.sha256,
    size: release.size,
    url: release.url,
    signature: release.signature,
    publishedAt: release.publishedAt,
    ...listingFields(listing),
  }
}

async function updateCatalog(storage, entry) {
  const existing = (await getJson(storage, CATALOG_KEY)) || { schemaVersion: CATALOG_SCHEMA_VERSION, plugins: [] }
  const plugins = (existing.plugins || []).filter((plugin) => plugin.id !== entry.id)
  plugins.push(entry)
  plugins.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
  const catalog = { schemaVersion: CATALOG_SCHEMA_VERSION, generatedAt: new Date().toISOString(), plugins }
  await storage.put(CATALOG_KEY, JSON.stringify(catalog, null, 2), 'application/json', NO_CACHE)
}

async function publishBundle({ storage, pluginDir, bundle, manifest, signingKey, listing }) {
  const { hex, digest } = sha256(bundle)
  const url = bundleKey(manifest.id, manifest.version)
  const release = {
    sha256: hex,
    signature: signDigest(digest, signingKey),
    size: bundle.length,
    url,
    publishedAt: new Date().toISOString(),
  }
  await storage.put(url, bundle, 'application/zip', IMMUTABLE)
  Object.assign(release, await uploadReadme(storage, pluginDir, manifest))
  release.iconUrl = await uploadIcon(storage, pluginDir, manifest)
  const latest = latestDocument(manifest, release, listing)
  await storage.put(latestKey(manifest.id), JSON.stringify(latest, null, 2), 'application/json', NO_CACHE)
  await updateCatalog(storage, catalogCard(manifest, release, listing))
  return latest
}

module.exports = { CATALOG_KEY, NO_CACHE, bundleKey, latestKey, publishBundle }
