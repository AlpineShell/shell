import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { FuseV1Options } from '@electron/fuses'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const releaseWorkflow = readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8')

const configuredFuses = packageJson.build.electronFuses

function fuseOptionName(configKey) {
  return configKey.charAt(0).toUpperCase() + configKey.slice(1)
}

function expectedAssertions() {
  return Object.entries(configuredFuses)
    .map(([key, enabled]) => `${fuseOptionName(key)} ${enabled ? 'Enabled' : 'Disabled'}`)
    .sort()
}

function workflowAssertions() {
  return [...releaseWorkflow.matchAll(/^\s*assertFuse (\w+) (\w+)$/gm)].map((match) => `${match[1]} ${match[2]}`).sort()
}

function stepIndex(name) {
  return releaseWorkflow.indexOf(`- name: ${name}`)
}

describe('electron fuses', () => {
  it('configures only fuses that Electron actually has', () => {
    const fuseOptionNames = Object.keys(FuseV1Options).filter((key) => Number.isNaN(Number(key)))
    for (const key of Object.keys(configuredFuses)) {
      expect(fuseOptionNames).toContain(fuseOptionName(key))
    }
  })

  it('leaves the file protocol privileges alone because the packaged renderer loads over file://', () => {
    expect(configuredFuses.grantFileProtocolExtraPrivileges).toBeUndefined()
  })

  it('has the release workflow assert every configured fuse and nothing else', () => {
    expect(workflowAssertions()).toEqual(expectedAssertions())
  })

  it('verifies the fuses before the installer is published', () => {
    expect(stepIndex('Build installer')).toBeLessThan(stepIndex('Verify Electron fuses'))
    expect(stepIndex('Verify Electron fuses')).toBeLessThan(stepIndex('Publish installer + latest.yml to Railway'))
    expect(stepIndex('Verify Electron fuses')).toBeLessThan(stepIndex('Attach installer to GitHub Release'))
  })
})
