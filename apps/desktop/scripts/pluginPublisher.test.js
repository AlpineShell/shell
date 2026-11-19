import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { publishBundle } = await import('./pluginPublisher.js')
const { packBundle } = await import('./pluginBundle.js')
const { createStorage } = await import('./pluginStorage.js')

const PLUGIN_ID = 'com.alpine.clock'

let workDir = ''
let pluginDir = ''
let storeDir = ''

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-publisher-'))
  pluginDir = path.join(workDir, PLUGIN_ID)
  storeDir = path.join(workDir, 'store')
  fs.mkdirSync(pluginDir)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(workDir, { recursive: true, force: true })
})

function readStoreJson(key) {
  return JSON.parse(fs.readFileSync(path.join(storeDir, ...key.split('/')), 'utf8'))
}

async function publishFirstParty(manifest, listing) {
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest))
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  const { bundle } = packBundle(pluginDir)
  await publishBundle({ storage: createStorage(storeDir), pluginDir, bundle, manifest, signingKey: privateKey, listing })
}

describe('publishing a first-party plugin', () => {
  it('lists it without a publisher or a community label and keeps its verified flag', async () => {
    await publishFirstParty({ id: PLUGIN_ID, name: 'Clock', version: '1.0.0', verified: true })

    const latest = readStoreJson(`plugins/${PLUGIN_ID}/latest.json`)
    const entry = readStoreJson('plugins/index.json').plugins[0]
    for (const document of [latest, entry]) {
      expect(document.verified).toBe(true)
      expect(document).not.toHaveProperty('publisher')
      expect(document).not.toHaveProperty('community')
    }
  })

  it('lists plugins from the official alpine-shell organisation as verified and not community', async () => {
    await publishFirstParty(
      { id: PLUGIN_ID, name: 'Clock', version: '1.0.0' },
      { publisher: { slug: 'alpine-shell', name: 'Alpine Shell' } },
    )

    const latest = readStoreJson(`plugins/${PLUGIN_ID}/latest.json`)
    const entry = readStoreJson('plugins/index.json').plugins[0]
    for (const document of [latest, entry]) {
      expect(document.verified).toBe(true)
      expect(document.community).toBe(false)
      expect(document.publisher).toEqual({ slug: 'alpine-shell', name: 'Alpine Shell' })
    }
  })

  it('never uploads a logo or readme from outside the plugin folder', async () => {
    fs.writeFileSync(path.join(workDir, 'outside.png'), 'secret')
    await publishFirstParty({ id: PLUGIN_ID, name: 'Clock', version: '1.0.0', marketplace: { logo: '../outside.png', readme: '../outside.png' } })

    const latest = readStoreJson(`plugins/${PLUGIN_ID}/latest.json`)
    expect(latest.iconUrl).toBeUndefined()
    expect(latest.readmeUrl).toBeUndefined()
  })
})

describe('publishing the images a readme shows', () => {
  const storeFile = (relativePath) => path.join(storeDir, 'plugins', PLUGIN_ID, ...relativePath.split('/'))

  function writePluginFile(relativePath, contents) {
    const target = path.join(pluginDir, ...relativePath.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }

  async function publishWithReadme(readme) {
    writePluginFile('README.md', readme)
    await publishFirstParty({ id: PLUGIN_ID, name: 'Clock', version: '1.0.0', marketplace: { readme: 'README.md' } })
  }

  it('uploads the bundled images next to the readme, where the store page looks for them', async () => {
    writePluginFile('assets/icon.png', 'png bytes')
    writePluginFile('docs/popup shot.jpg', 'jpg bytes')
    writePluginFile('preview.webp', 'webp bytes')
    await publishWithReadme(
      [
        '![Icon](assets/icon.png)',
        '![Popup](<docs/popup shot.jpg> "The popup")',
        '<img alt="Preview" src="./preview.webp?raw=true" width="300">',
      ].join('\n'),
    )

    expect(fs.readFileSync(storeFile('assets/icon.png'), 'utf8')).toBe('png bytes')
    expect(fs.readFileSync(storeFile('docs/popup shot.jpg'), 'utf8')).toBe('jpg bytes')
    expect(fs.readFileSync(storeFile('preview.webp'), 'utf8')).toBe('webp bytes')
  })

  it('leaves remote, missing, non-image and outside images alone', async () => {
    fs.writeFileSync(path.join(workDir, 'outside.png'), 'secret')
    writePluginFile('script.svg', '<svg onload="alert(1)"/>')
    writePluginFile('notes.txt', 'text')
    await publishWithReadme(
      [
        '![Remote](https://example.com/shot.png)',
        '![Rooted](/shot.png)',
        '![Missing](missing.png)',
        '![Outside](../outside.png)',
        '![Vector](script.svg)',
        '![Text](notes.txt)',
      ].join('\n'),
    )

    const published = fs.readdirSync(path.join(storeDir, 'plugins', PLUGIN_ID)).sort()
    expect(published).toEqual(['1.0.0', 'README.md', 'latest.json'])
    expect(fs.existsSync(path.join(storeDir, 'outside.png'))).toBe(false)
  })

  it('keeps the store icon when the readme shows a file with the same name', async () => {
    writePluginFile('icon.png', 'store icon')
    await publishWithReadme('![Same name](icon.png)')

    expect(fs.readFileSync(storeFile('icon.png'), 'utf8')).toBe('store icon')
  })
})
