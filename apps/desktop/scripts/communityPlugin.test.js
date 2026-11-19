import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { build, localBuild, main, publish, revoke, stage, stagingKey } = await import('./communityPlugin.js')
const { canonicalJson } = await import('./pluginSigning.js')
const { CALLBACK_RETRY_DELAYS_MS } = await import('./pluginCallback.js')
const { extractZip } = await import('../electron/pluginZip.js')

const PLUGIN_ID = 'com.example.weather'
const VERSION = '1.2.0'
const SUBMISSION = 'sub_123'
const CALLBACK = 'https://auth.example.test/internal/plugin-builds/sub_123'
const TOKEN = 'test-callback-token'
const MANIFEST = { id: PLUGIN_ID, name: 'Weather', version: VERSION, apiVersion: 1, main: 'main.js' }
const RENDERER = 'export default function Weather() {}'
const PLUGIN_FILES = { 'plugin.json': JSON.stringify(MANIFEST), 'index.js': RENDERER, 'main.js': 'module.exports = {}' }

let workDir = ''
let tmpRoot = ''
let storeDir = ''

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-community-'))
  tmpRoot = path.join(workDir, 'tmp')
  storeDir = path.join(workDir, 'store')
  fs.mkdirSync(tmpRoot)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(workDir, { recursive: true, force: true })
})

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    if (content === undefined) continue
    const target = path.join(root, ...relativePath.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
}

function makeCheckout(files = {}) {
  const checkoutDir = path.join(workDir, 'checkout')
  writeFiles(checkoutDir, { ...PLUGIN_FILES, ...files })
  return checkoutDir
}

function callbackFetch(statuses = []) {
  const calls = []
  const fetch = vi.fn(async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null })
    const status = statuses.length > 0 ? statuses.shift() : 204
    if (status instanceof Error) throw status
    return new Response(null, { status })
  })
  return { fetch, calls }
}

function makeDeps(overrides = {}) {
  const { fetch, calls } = callbackFetch()
  return {
    deps: {
      run: vi.fn(),
      fetch,
      sleep: vi.fn(async () => {}),
      env: { PLUGIN_BUILD_CALLBACK_TOKEN: TOKEN },
      now: () => new Date('2026-11-03T10:00:00.000Z'),
      tmpdir: () => tmpRoot,
      ...overrides,
    },
    calls,
  }
}

function readStoreJson(key) {
  return JSON.parse(fs.readFileSync(path.join(storeDir, ...key.split('/')), 'utf8'))
}

function storeHas(key) {
  return fs.existsSync(path.join(storeDir, ...key.split('/')))
}

function unzipToDir(bundle) {
  const target = fs.mkdtempSync(path.join(workDir, 'unzipped-'))
  return { target, files: extractZip(bundle, target).sort() }
}

async function buildAndStage(deps, files) {
  const outDir = path.join(workDir, 'out')
  await build({ dir: makeCheckout(files), out: outDir }, deps)
  await stage({ submission: SUBMISSION, out: outDir, callback: CALLBACK, store: storeDir }, deps)
  return fs.readFileSync(path.join(outDir, 'bundle.alpineplugin'))
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function base64Pkcs8(privateKey) {
  return Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64')
}

describe('build', () => {
  it('packs the checkout without node_modules, .git, .github or anything .alpineignore lists', async () => {
    const { deps } = makeDeps()
    const checkoutDir = makeCheckout({
      'dist/renderer.js': 'export default 1',
      'dist/renderer.js.map': '{}',
      'docs/guide.md': '# Guide',
      'secret.txt': 'keep out',
      'nested/secret.txt': 'stays',
      'node_modules/left-pad/index.js': 'x',
      '.git/HEAD': 'ref',
      '.github/workflows/release.yml': 'on: push',
      '.alpineignore': '# not shipped\n*.map\ndocs/\n/secret.txt\n',
    })
    const outDir = path.join(workDir, 'out')

    await build({ dir: checkoutDir, out: outDir }, deps)

    const bundle = fs.readFileSync(path.join(outDir, 'bundle.alpineplugin'))
    const expected = ['.alpineignore', 'dist/renderer.js', 'index.js', 'main.js', 'nested/secret.txt', 'plugin.json']
    expect(unzipToDir(bundle).files).toEqual(expected)
    const files = JSON.parse(fs.readFileSync(path.join(outDir, 'files.json'), 'utf8'))
    expect(files.map((file) => file.path)).toEqual(expected)
    expect(files.find((file) => file.path === 'main.js').size).toBe(Buffer.byteLength('module.exports = {}'))
    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))).toEqual(MANIFEST)
  })

  it('packs the same source into the same bytes', async () => {
    const { deps } = makeDeps()
    const checkoutDir = makeCheckout()
    await build({ dir: checkoutDir, out: path.join(workDir, 'first') }, deps)
    await build({ dir: checkoutDir, out: path.join(workDir, 'second') }, deps)
    const first = fs.readFileSync(path.join(workDir, 'first', 'bundle.alpineplugin'))
    const second = fs.readFileSync(path.join(workDir, 'second', 'bundle.alpineplugin'))
    expect(sha256Hex(first)).toBe(sha256Hex(second))
  })

  it('installs and runs the build script with bun when the plugin has a bun lockfile', async () => {
    const { deps } = makeDeps()
    const checkoutDir = makeCheckout({ 'package.json': JSON.stringify({ scripts: { build: 'vite build' } }), 'bun.lock': '{}' })
    await build({ dir: checkoutDir, out: path.join(workDir, 'out') }, deps)
    expect(deps.run.mock.calls).toEqual([
      ['bun', ['install'], checkoutDir],
      ['bun', ['run', 'build'], checkoutDir],
    ])
  })

  it('falls back to npm without a bun lockfile and runs nothing without a build script', async () => {
    const withScript = makeDeps().deps
    const checkoutDir = makeCheckout({ 'package.json': JSON.stringify({ scripts: { build: 'tsc' } }) })
    await build({ dir: checkoutDir, out: path.join(workDir, 'out') }, withScript)
    expect(withScript.run.mock.calls.map(([command, args]) => [command, ...args])).toEqual([
      ['npm', 'install'],
      ['npm', 'run', 'build'],
    ])

    const withoutScript = makeDeps().deps
    fs.writeFileSync(path.join(checkoutDir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }))
    await build({ dir: checkoutDir, out: path.join(workDir, 'out-2') }, withoutScript)
    expect(withoutScript.run).not.toHaveBeenCalled()
  })

  it('refuses a manifest the SDK does not accept', async () => {
    const { deps } = makeDeps()
    const checkoutDir = makeCheckout({ 'plugin.json': JSON.stringify({ ...MANIFEST, version: 'one' }) })
    await expect(build({ dir: checkoutDir, out: path.join(workDir, 'out') }, deps)).rejects.toThrow(/version: must be semver/)
    fs.writeFileSync(path.join(checkoutDir, 'plugin.json'), JSON.stringify({ ...MANIFEST, id: undefined }))
    await expect(build({ dir: checkoutDir, out: path.join(workDir, 'out') }, deps)).rejects.toThrow(
      `plugin.json needs an "id" that is your developer organisation's slug, a dot and a name, such as example-labs.hello`
    )
    expect(fs.existsSync(path.join(workDir, 'out'))).toBe(false)
  })

  async function expectBuildRefused(files, message) {
    const { deps } = makeDeps()
    const outDir = path.join(workDir, 'out')
    const checkoutDir = makeCheckout(files)
    await expect(build({ dir: checkoutDir, out: outDir }, deps)).rejects.toThrow(message)
    expect(fs.existsSync(outDir)).toBe(false)
    expect(fs.readdirSync(tmpRoot)).toEqual([])
    fs.rmSync(checkoutDir, { recursive: true, force: true })
  }

  function manifestWith(fields) {
    return JSON.stringify({ ...MANIFEST, ...fields })
  }

  it('builds a plugin the app loads, with its widgets, settings page and readme', async () => {
    const { deps } = makeDeps()
    const outDir = path.join(workDir, 'out')
    const manifest = {
      ...MANIFEST,
      renderer: 'dist/index.js',
      icon: 'lucide:Cloud',
      contributes: {
        topbarWidgets: [{ slot: 'right' }, { slot: 'left', export: 'Forecast' }],
        settingsPages: [{ label: 'Weather', icon: 'lucide:Cloud', export: 'WeatherSettings' }],
        settings: [{ key: 'units', type: 'select', label: 'Units', default: 'metric', options: [{ value: 'metric', label: 'Metric' }] }],
      },
      marketplace: { readme: 'README.md', category: 'productivity' },
    }
    const checkoutDir = makeCheckout({
      'index.js': undefined,
      'plugin.json': JSON.stringify(manifest),
      'dist/index.js': "export { Weather as default } from './widgets.js'\nexport * from './settings.js'\nexport const Forecast = () => null\n",
      'dist/widgets.js': 'export function Weather() {}\n',
      'dist/settings.js': 'export function WeatherSettings() {}\nexport default 1\n',
      'README.md': '# Weather',
    })

    await build({ dir: checkoutDir, out: outDir }, deps)

    expect(JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))).toEqual(manifest)
    expect(fs.readdirSync(tmpRoot)).toEqual([])
  })

  it('refuses a plugin without the renderer the app loads', async () => {
    await expectBuildRefused({ 'index.js': undefined }, 'Alpine Shell would refuse this plugin: renderer: missing or escapes plugin dir')
    await expectBuildRefused(
      { 'plugin.json': manifestWith({ renderer: 'dist/index.js' }) },
      'Alpine Shell would refuse this plugin: renderer: missing or escapes plugin dir'
    )
  })

  it('checks the bundle, so a renderer that .alpineignore leaves out is refused', async () => {
    await expectBuildRefused({ '.alpineignore': 'index.js\n' }, 'Alpine Shell would refuse this plugin: renderer: missing or escapes plugin dir')
  })

  it('refuses paths that leave the plugin folder', async () => {
    writeFiles(workDir, { 'x/index.js': RENDERER, 'README.md': '# Outside' })
    await expectBuildRefused(
      { 'plugin.json': manifestWith({ renderer: '../x/index.js' }) },
      'Alpine Shell would refuse this plugin: renderer: missing or escapes plugin dir'
    )
    await expectBuildRefused(
      { 'plugin.json': manifestWith({ marketplace: { readme: '../README.md' } }) },
      'Alpine Shell would refuse this plugin: marketplace.readme: missing/escapes plugin dir'
    )
  })

  it('refuses a settings page icon that is neither a Lucide name nor a file in the plugin', async () => {
    await expectBuildRefused(
      { 'plugin.json': manifestWith({ contributes: { settingsPages: [{ label: 'Weather', icon: 'cloud.png' }] } }) },
      "Alpine Shell would refuse this plugin: contributes.settingsPages: 'icon' must be 'lucide:<Name>' or a file inside the plugin folder"
    )
  })

  it('refuses a widget or settings page whose export the built renderer does not have', async () => {
    await expectBuildRefused(
      { 'plugin.json': manifestWith({ contributes: { topbarWidgets: [{ slot: 'right', export: 'Clock' }] } }) },
      'contributes.topbarWidgets names the export "Clock", but the renderer index.js has no such export'
    )
    await expectBuildRefused(
      { 'plugin.json': manifestWith({ contributes: { settingsPages: [{ label: 'Weather', export: 'WeatherSettings' }] } }) },
      'contributes.settingsPages names the export "WeatherSettings", but the renderer index.js has no such export'
    )
  })

  it('refuses a widget without an export name when the renderer has no default export', async () => {
    await expectBuildRefused(
      { 'index.js': 'export function Weather() {}', 'plugin.json': manifestWith({ contributes: { topbarWidgets: [{ slot: 'right' }] } }) },
      'contributes.topbarWidgets names the export "default", but the renderer index.js has no such export'
    )
  })

  it('refuses unknown top-level fields and says where contributions belong', async () => {
    await expectBuildRefused(
      { 'plugin.json': manifestWith({ settingsPages: [{ label: 'Weather' }] }) },
      'plugin.json is not valid: "settingsPages" is not a top-level field, it belongs under "contributes"'
    )
    await expectBuildRefused(
      { 'plugin.json': manifestWith({ topbarWidgets: [], settings: [] }) },
      'plugin.json is not valid: "topbarWidgets" is not a top-level field, it belongs under "contributes"; "settings" is not a top-level field, it belongs under "contributes"'
    )
    await expectBuildRefused({ 'plugin.json': manifestWith({ verified: true }) }, 'plugin.json is not valid: "verified" is not a plugin.json field')
  })

  it('refuses a plugin made for an API version this app does not support, naming the ones it does', async () => {
    await expectBuildRefused({ 'plugin.json': manifestWith({ apiVersion: 2 }) }, 'plugin.json has "apiVersion": 2, but Alpine Shell supports apiVersion 1')
    await expectBuildRefused({ 'plugin.json': manifestWith({ apiVersion: 0 }) }, 'plugin.json has "apiVersion": 0, but Alpine Shell supports apiVersion 1')
  })
})

describe('stage', () => {
  it('uploads the bundle to the staging key and reports what the reviewer needs, without running anything', async () => {
    const { deps, calls } = makeDeps()
    const outDir = path.join(workDir, 'out')
    await build({ dir: makeCheckout(), out: outDir }, deps)
    deps.run.mockClear()

    await stage({ submission: SUBMISSION, out: outDir, callback: CALLBACK, runUrl: 'https://github.test/runs/1', store: storeDir }, deps)

    const bundle = fs.readFileSync(path.join(outDir, 'bundle.alpineplugin'))
    expect(fs.readFileSync(path.join(storeDir, 'plugins-staging', `${SUBMISSION}.alpineplugin`))).toEqual(bundle)
    expect(deps.run).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(CALLBACK)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0].body).toEqual({
      stage: 'build',
      ok: true,
      runUrl: 'https://github.test/runs/1',
      sha256: sha256Hex(bundle),
      size: bundle.length,
      manifest: MANIFEST,
      files: [
        { path: 'index.js', size: Buffer.byteLength(RENDERER) },
        { path: 'main.js', size: Buffer.byteLength('module.exports = {}') },
        { path: 'plugin.json', size: Buffer.byteLength(JSON.stringify(MANIFEST)) },
      ],
    })
  })

  it('reads the manifest from the bundle itself, not from what the build job wrote beside it', async () => {
    const { deps, calls } = makeDeps()
    const outDir = path.join(workDir, 'out')
    await build({ dir: makeCheckout(), out: outDir }, deps)
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ ...MANIFEST, id: 'com.example.other' }))
    fs.writeFileSync(path.join(outDir, 'files.json'), '[]')

    await stage({ submission: SUBMISSION, out: outDir, callback: CALLBACK, store: storeDir }, deps)

    expect(calls[0].body.manifest.id).toBe(PLUGIN_ID)
    expect(calls[0].body.files).toHaveLength(3)
  })

  it('refuses a submission id that would leave the staging folder', async () => {
    const { deps } = makeDeps()
    const outDir = path.join(workDir, 'out')
    await build({ dir: makeCheckout(), out: outDir }, deps)
    await expect(stage({ submission: '../plugins/x', out: outDir, callback: CALLBACK, store: storeDir }, deps)).rejects.toThrow(/Invalid submission id/)
    expect(fs.existsSync(storeDir)).toBe(false)
  })
})

describe('callback', () => {
  it('retries a failing callback three times before it gives up', async () => {
    const { fetch, calls } = callbackFetch([503, new Error('socket hang up'), 502, 500])
    const { deps } = makeDeps({ fetch })
    const outDir = path.join(workDir, 'out')
    await build({ dir: makeCheckout(), out: outDir }, deps)

    await expect(stage({ submission: SUBMISSION, out: outDir, callback: CALLBACK, store: storeDir }, deps)).rejects.toThrow(/Could not report .* answered 500/)

    expect(calls).toHaveLength(4)
    expect(deps.sleep.mock.calls.map(([delay]) => delay)).toEqual(CALLBACK_RETRY_DELAYS_MS)
  })

  it('stops retrying once the callback succeeds, and does not retry a refusal', async () => {
    const recovering = callbackFetch([503, 204])
    await buildAndStage(makeDeps({ fetch: recovering.fetch }).deps)
    expect(recovering.calls).toHaveLength(2)

    const refusing = callbackFetch([401])
    await expect(buildAndStage(makeDeps({ fetch: refusing.fetch }).deps)).rejects.toThrow(/answered 401/)
    expect(refusing.calls).toHaveLength(1)
  })

  it('refuses to report without the callback token', async () => {
    const { deps, calls } = makeDeps({ env: {} })
    await expect(buildAndStage(deps)).rejects.toThrow(/PLUGIN_BUILD_CALLBACK_TOKEN is not set/)
    expect(calls).toHaveLength(0)
  })
})

describe('local-build', () => {
  const REPOSITORY = 'example/weather-plugin'
  const COMMIT = 'a'.repeat(40)

  function cloningRun(files = {}) {
    return vi.fn((command, args) => {
      if (command === 'git' && args[0] === 'clone') {
        writeFiles(args[3], { ...PLUGIN_FILES, ...files })
      }
    })
  }

  it('clones the repository, checks out the commit, builds, stages and cleans up', async () => {
    const { deps, calls } = makeDeps({ run: cloningRun() })

    await localBuild({ submission: SUBMISSION, repository: REPOSITORY, commit: COMMIT, store: storeDir, callback: CALLBACK }, deps)

    const [clone, checkout] = deps.run.mock.calls
    expect(clone[0]).toBe('git')
    expect(clone[1].slice(0, 3)).toEqual(['clone', '--quiet', `https://github.com/${REPOSITORY}.git`])
    expect(checkout[0]).toBe('git')
    expect(checkout[1]).toContain(COMMIT)
    expect(checkout[2]).toBe(clone[1][3])
    expect(storeHas(stagingKey(SUBMISSION))).toBe(true)
    expect(calls.map((call) => call.body.ok)).toEqual([true])
    expect(fs.readdirSync(tmpRoot)).toEqual([])
  })

  it('reports a failed build with the error and still cleans up', async () => {
    const { deps, calls } = makeDeps({ run: cloningRun({ 'plugin.json': '{ not json' }) })

    await expect(
      localBuild({ submission: SUBMISSION, repository: REPOSITORY, commit: COMMIT, store: storeDir, callback: CALLBACK }, deps)
    ).rejects.toThrow(/Invalid plugin.json/)

    expect(calls).toHaveLength(1)
    expect(calls[0].body).toEqual({ stage: 'build', ok: false, runUrl: null, error: expect.stringMatching(/Invalid plugin.json/) })
    expect(fs.readdirSync(tmpRoot)).toEqual([])
    expect(storeHas(stagingKey(SUBMISSION))).toBe(false)
  })

  it('keeps the original error when the failure report cannot be delivered', async () => {
    const run = vi.fn(() => {
      throw new Error('git clone failed with exit code 128')
    })
    const { fetch } = callbackFetch([503, 503, 503, 503])
    const { deps } = makeDeps({ run, fetch })

    await expect(
      localBuild({ submission: SUBMISSION, repository: REPOSITORY, commit: COMMIT, store: storeDir, callback: CALLBACK }, deps)
    ).rejects.toThrow('git clone failed with exit code 128')

    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fs.readdirSync(tmpRoot)).toEqual([])
  })

  it('refuses a repository or commit that is not exact', async () => {
    const { deps, calls } = makeDeps({ run: cloningRun() })
    await expect(
      localBuild({ submission: SUBMISSION, repository: 'example/weather; rm -rf /', commit: COMMIT, store: storeDir, callback: CALLBACK }, deps)
    ).rejects.toThrow(/Invalid repository/)
    await expect(
      localBuild({ submission: SUBMISSION, repository: REPOSITORY, commit: 'main', store: storeDir, callback: CALLBACK }, deps)
    ).rejects.toThrow(/Invalid commit/)
    expect(deps.run).not.toHaveBeenCalled()
    expect(calls.map((call) => call.body.ok)).toEqual([false, false])
  })
})

describe('publish', () => {
  function publishOptions(overrides = {}) {
    return {
      submission: SUBMISSION,
      sha256: '',
      publisherSlug: 'example',
      publisherName: 'Example Labs',
      callback: CALLBACK,
      runUrl: 'https://github.test/runs/2',
      store: storeDir,
      ...overrides,
    }
  }

  it('signs the reviewed bundle and lists it with its publisher as a community plugin', async () => {
    const { deps, calls } = makeDeps()
    const bundle = await buildAndStage(deps, {
      'plugin.json': JSON.stringify({ ...MANIFEST, engines: { alpineShell: '>=0.1.0' }, marketplace: { readme: 'README.md' } }),
      'icon.png': 'png-bytes',
      'README.md': '# Weather',
    })
    calls.length = 0

    await publish(publishOptions({ sha256: sha256Hex(bundle) }), deps)

    const bundleKey = `plugins/${PLUGIN_ID}/${VERSION}/${PLUGIN_ID}-${VERSION}.alpineplugin`
    expect(fs.readFileSync(path.join(storeDir, ...bundleKey.split('/')))).toEqual(bundle)
    expect(fs.readFileSync(path.join(storeDir, 'plugins', PLUGIN_ID, 'icon.png'), 'utf8')).toBe('png-bytes')
    expect(fs.readFileSync(path.join(storeDir, 'plugins', PLUGIN_ID, 'README.md'), 'utf8')).toBe('# Weather')
    const latest = readStoreJson(`plugins/${PLUGIN_ID}/latest.json`)
    expect(latest).toMatchObject({
      id: PLUGIN_ID,
      version: VERSION,
      url: bundleKey,
      sha256: sha256Hex(bundle),
      size: bundle.length,
      verified: false,
      publisher: { slug: 'example', name: 'Example Labs' },
      community: true,
      apiVersion: 1,
      engines: { alpineShell: '>=0.1.0' },
    })
    const publicKey = fs.readFileSync(path.join(storeDir, 'dev-public-key.pem'), 'utf8')
    expect(crypto.verify(null, Buffer.from(latest.sha256, 'hex'), publicKey, Buffer.from(latest.signature, 'base64'))).toBe(true)
    const entry = readStoreJson('plugins/index.json').plugins.find((plugin) => plugin.id === PLUGIN_ID)
    expect(entry).toMatchObject({
      sha256: latest.sha256,
      signature: latest.signature,
      verified: false,
      publisher: { slug: 'example', name: 'Example Labs' },
      community: true,
      apiVersion: 1,
      engines: { alpineShell: '>=0.1.0' },
    })
    expect(calls.map((call) => call.body)).toEqual([{ stage: 'publish', ok: true, runUrl: 'https://github.test/runs/2' }])
  })

  it('omits the community flag when publishing for the official alpine-shell organisation', async () => {
    const { deps } = makeDeps()
    const bundle = await buildAndStage(deps)

    await publish(
      publishOptions({ sha256: sha256Hex(bundle), publisherSlug: 'alpine-shell', publisherName: 'Alpine Shell' }),
      deps,
    )

    const latest = readStoreJson(`plugins/${PLUGIN_ID}/latest.json`)
    const entry = readStoreJson('plugins/index.json').plugins.find((plugin) => plugin.id === PLUGIN_ID)
    for (const document of [latest, entry]) {
      expect(document.verified).toBe(true)
      expect(document.community).toBe(false)
      expect(document.publisher).toEqual({ slug: 'alpine-shell', name: 'Alpine Shell' })
    }
  })

  it('refuses a staged bundle whose sha256 differs from the reviewed one, before signing anything', async () => {
    const { deps, calls } = makeDeps()
    await buildAndStage(deps)
    calls.length = 0

    await expect(publish(publishOptions({ sha256: 'b'.repeat(64) }), deps)).rejects.toThrow(/Refusing to publish: the staged bundle has sha256/)

    expect(storeHas(`plugins/${PLUGIN_ID}`)).toBe(false)
    expect(storeHas('plugins/index.json')).toBe(false)
    expect(calls.map((call) => call.body)).toEqual([
      { stage: 'publish', ok: false, runUrl: 'https://github.test/runs/2', error: expect.stringMatching(/Refusing to publish/) },
    ])
  })

  it('reports a submission with nothing staged', async () => {
    const { deps, calls } = makeDeps()
    await expect(publish(publishOptions({ sha256: 'c'.repeat(64) }), deps)).rejects.toThrow(/No staged bundle/)
    expect(calls[0].body.ok).toBe(false)
  })

  it('creates a development key once and signs every later bundle with it', async () => {
    const { deps } = makeDeps()
    const bundle = await buildAndStage(deps)
    await publish(publishOptions({ sha256: sha256Hex(bundle) }), deps)
    const privateKey = fs.readFileSync(path.join(storeDir, '.dev-signing-key'), 'utf8')
    const publicKey = fs.readFileSync(path.join(storeDir, 'dev-public-key.pem'), 'utf8')

    await publish(publishOptions({ sha256: sha256Hex(bundle) }), deps)

    expect(fs.readFileSync(path.join(storeDir, '.dev-signing-key'), 'utf8')).toBe(privateKey)
    expect(fs.readFileSync(path.join(storeDir, 'dev-public-key.pem'), 'utf8')).toBe(publicKey)
    expect(crypto.createPublicKey(crypto.createPrivateKey(privateKey)).export({ type: 'spki', format: 'pem' })).toBe(publicKey)
  })

  it('signs with ALPINE_PLUGIN_SIGNING_KEY when it is set and creates no development key', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const { deps } = makeDeps({ env: { PLUGIN_BUILD_CALLBACK_TOKEN: TOKEN, ALPINE_PLUGIN_SIGNING_KEY: base64Pkcs8(privateKey) } })
    const bundle = await buildAndStage(deps)

    await publish(publishOptions({ sha256: sha256Hex(bundle) }), deps)

    const latest = readStoreJson(`plugins/${PLUGIN_ID}/latest.json`)
    expect(crypto.verify(null, Buffer.from(latest.sha256, 'hex'), publicKey, Buffer.from(latest.signature, 'base64'))).toBe(true)
    expect(storeHas('.dev-signing-key')).toBe(false)
  })

  it('keeps the other plugins in the catalog', async () => {
    const { deps } = makeDeps()
    writeFiles(storeDir, {
      'plugins/index.json': JSON.stringify({ schemaVersion: 1, plugins: [{ id: 'com.alpine.clock', name: 'Clock', version: '1.0.0' }] }),
    })
    const bundle = await buildAndStage(deps)

    await publish(publishOptions({ sha256: sha256Hex(bundle) }), deps)

    const ids = readStoreJson('plugins/index.json').plugins.map((plugin) => plugin.id)
    expect(ids).toEqual(['com.alpine.clock', PLUGIN_ID])
    expect(readStoreJson('plugins/index.json').plugins[0].publisher).toBeUndefined()
  })
})

describe('revoke', () => {
  const LIST_URL = 'https://auth.example.test/plugins/revocations'
  const REVOCATION_CALLBACK = 'https://auth.example.test/internal/plugin-revocations'

  function revocationFetch(list) {
    const calls = []
    const fetch = vi.fn(async (url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : null })
      if (url === LIST_URL) return Response.json(list)
      return new Response(null, { status: 204 })
    })
    return { fetch, calls }
  }

  it('publishes a signed revocation list the matching public key verifies', async () => {
    const { fetch, calls } = revocationFetch({
      revoked: [
        { id: PLUGIN_ID, version: null, reason: 'Steals data' },
        { id: 'com.example.notes', version: '2.0.1', reason: 'Crashes the shell' },
      ],
    })
    const { deps } = makeDeps({ fetch })

    await revoke({ listUrl: LIST_URL, callback: REVOCATION_CALLBACK, runUrl: 'https://github.test/runs/3', store: storeDir }, deps)

    const document = readStoreJson('plugins/revoked.json')
    expect(document).toMatchObject({
      version: 1,
      issuedAt: '2026-11-03T10:00:00.000Z',
      revoked: [
        { id: PLUGIN_ID, version: null, reason: 'Steals data' },
        { id: 'com.example.notes', version: '2.0.1', reason: 'Crashes the shell' },
      ],
    })
    const { signature, ...signed } = document
    const canonical = canonicalJson(signed)
    expect(canonical.startsWith('{"issuedAt":"2026-11-03T10:00:00.000Z","revoked":[{"id":"com.example.weather","reason":"Steals data","version":null}')).toBe(true)
    const publicKey = fs.readFileSync(path.join(storeDir, 'dev-public-key.pem'), 'utf8')
    expect(crypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, Buffer.from(signature, 'base64'))).toBe(true)
    expect(crypto.verify(null, Buffer.from(canonicalJson({ ...signed, revoked: [] }), 'utf8'), publicKey, Buffer.from(signature, 'base64'))).toBe(false)
    expect(calls.at(-1)).toEqual({ url: REVOCATION_CALLBACK, body: { ok: true, runUrl: 'https://github.test/runs/3' } })
  })

  it('keeps the last list and reports the failure when the list cannot be read', async () => {
    const fetch = vi.fn(async (url) => (url === LIST_URL ? new Response(null, { status: 503 }) : new Response(null, { status: 204 })))
    const { deps } = makeDeps({ fetch })

    await expect(revoke({ listUrl: LIST_URL, callback: REVOCATION_CALLBACK, store: storeDir }, deps)).rejects.toThrow(/answered 503/)

    expect(storeHas('plugins/revoked.json')).toBe(false)
    const report = fetch.mock.calls.find(([url]) => url === REVOCATION_CALLBACK)
    expect(JSON.parse(report[1].body)).toEqual({ ok: false, runUrl: null, error: 'The revocation list answered 503' })
  })
})

describe('command line', () => {
  it('passes every flag through to the command', async () => {
    const { deps, calls } = makeDeps()
    const outDir = path.join(workDir, 'out')
    await main(['build', '--dir', makeCheckout(), '--out', outDir], deps)
    await main(['stage', '--submission', SUBMISSION, '--out', outDir, '--callback', CALLBACK, '--run-url', 'https://github.test/runs/4', '--store', storeDir], deps)
    expect(calls[0].body.runUrl).toBe('https://github.test/runs/4')
    expect(storeHas(stagingKey(SUBMISSION))).toBe(true)
  })

  it('names the missing flags and refuses unknown ones', async () => {
    const { deps } = makeDeps()
    await expect(main(['publish', '--submission', SUBMISSION], deps)).rejects.toThrow(/Missing --sha256, --publisher-slug, --publisher-name, --callback/)
    await expect(main(['build', '--dir', 'a', '--out', 'b', '--force'], deps)).rejects.toThrow(/--force/)
    await expect(main(['deploy'], deps)).rejects.toThrow(/Usage/)
  })

  it('reports a failure the workflow saw before the script could', async () => {
    const { deps, calls } = makeDeps()
    await main(['report-failure', '--stage', 'build', '--callback', CALLBACK, '--run-url', 'https://github.test/runs/5', '--error', 'The build failed.'], deps)
    await main(['report-failure', '--stage', 'revoke', '--callback', CALLBACK], deps)
    expect(calls.map((call) => call.body)).toEqual([
      { stage: 'build', ok: false, runUrl: 'https://github.test/runs/5', error: 'The build failed.' },
      { ok: false, runUrl: null, error: 'The revoke job failed' },
    ])
  })
})
