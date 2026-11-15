import fs from 'fs'
import { describe, expect, it } from 'vitest'

const { main } = await import('./reportPluginRunFailure.js')

const CALLBACK = 'https://auth.test/internal/plugin-builds/sub-1'

function recordingDeps() {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, authorization: init.headers.Authorization, body: JSON.parse(init.body) })
    return new Response('{}', { status: 200 })
  }
  return { calls, deps: { fetch, env: { PLUGIN_BUILD_CALLBACK_TOKEN: 'token' }, sleep: async () => {} } }
}

function requiredModules(fileName) {
  const source = fs.readFileSync(new URL(fileName, import.meta.url), 'utf8')
  return [...source.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1])
}

describe('reportPluginRunFailure', () => {
  it('reports a failed build, publish or revoke to the account service', async () => {
    const { deps, calls } = recordingDeps()
    await main(['--stage', 'build', '--callback', CALLBACK, '--run-url', 'https://github.test/runs/5', '--error', 'The build failed.'], deps)
    await main(['--stage', 'revoke', '--callback', CALLBACK], deps)
    expect(calls).toEqual([
      {
        url: CALLBACK,
        authorization: 'Bearer token',
        body: { stage: 'build', ok: false, runUrl: 'https://github.test/runs/5', error: 'The build failed.' },
      },
      { url: CALLBACK, authorization: 'Bearer token', body: { ok: false, runUrl: null, error: 'The revoke job failed' } },
    ])
  })

  it('refuses an unknown stage and a missing callback', async () => {
    const { deps } = recordingDeps()
    await expect(main(['--stage', 'deploy', '--callback', CALLBACK], deps)).rejects.toThrow('Invalid stage: deploy')
    await expect(main(['--stage', 'build'], deps)).rejects.toThrow(/Usage/)
  })

  it('loads nothing but Node built-ins and the callback client, so it runs before any install', () => {
    expect(requiredModules('./reportPluginRunFailure.js')).toEqual(['node:util', './pluginCallback'])
    expect(requiredModules('./pluginCallback.js')).toEqual([])
  })
})
