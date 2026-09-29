import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('./publishPlugin.js', import.meta.url))
const PLUGIN_ID = 'com.example.demo'
const UNREACHABLE_STORAGE = {
  STORAGE_ENDPOINT: 'http://127.0.0.1:9',
  STORAGE_ACCESS_KEY_ID: 'unused',
  STORAGE_SECRET_ACCESS_KEY: 'unused',
  STORAGE_BUCKET: 'alpine-plugins',
}

let workDir = ''
let pluginDir = ''

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-publish-'))
  pluginDir = path.join(workDir, PLUGIN_ID)
  fs.mkdirSync(pluginDir)
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id: PLUGIN_ID, name: 'Demo', version: '1.0.0' }))
})

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true })
})

function publish(signingKey) {
  const env = { ...process.env, ...UNREACHABLE_STORAGE }
  delete env.ALPINE_PLUGIN_SIGNING_KEY
  if (signingKey) env.ALPINE_PLUGIN_SIGNING_KEY = signingKey
  return spawnSync(process.execPath, [SCRIPT, pluginDir], { env, encoding: 'utf8' })
}

function base64Pkcs8(privateKey) {
  return Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64')
}

describe('publishing a plugin', () => {
  it('refuses to publish without a signing key, before packing anything', () => {
    const result = publish(null)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/ALPINE_PLUGIN_SIGNING_KEY is not set/)
    expect(fs.readdirSync(pluginDir)).toEqual(['plugin.json'])
  })

  it('refuses a signing key that is not Ed25519', () => {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const result = publish(base64Pkcs8(privateKey))
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/must be an Ed25519 key/)
    expect(fs.readdirSync(pluginDir)).toEqual(['plugin.json'])
  })
})
