import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const { hasExport, readModuleExports } = await import('./rendererExports.js')

let rootDir = ''
let pluginDir = ''

beforeEach(() => {
  rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-renderer-exports-')))
  pluginDir = path.join(rootDir, 'plugin')
  fs.mkdirSync(pluginDir)
})

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true })
})

function writeModule(relativePath, source) {
  const target = path.join(pluginDir, ...relativePath.split('/'))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, source)
  return target
}

function exportsOf(source) {
  return readModuleExports(writeModule('index.js', source), pluginDir)
}

describe('readModuleExports', () => {
  it('finds every form of local export', () => {
    const found = exportsOf(
      [
        'export default function Widget() {}',
        'export function Named() {}',
        'export class Page {}',
        'export const a = 1, { b, c: [d] } = {}',
        'const e = 1',
        'export { e as Renamed, e as "quoted name" }',
        "export * as ns from './other.js'",
      ].join('\n')
    )
    expect([...found.names].sort()).toEqual(['Named', 'Page', 'Renamed', 'a', 'b', 'd', 'default', 'ns', 'quoted name'])
    expect(found.open).toBe(false)
  })

  it('treats export default of an expression and a renamed default as the default export', () => {
    expect(exportsOf('export default 42').names.has('default')).toBe(true)
    expect(exportsOf('const Widget = () => null\nexport { Widget as default }').names.has('default')).toBe(true)
  })

  it('follows star re-exports inside the plugin, without their default', () => {
    writeModule('chunks/settings.js', "export function Settings() {}\nexport default 1\nexport * from './deeper.js'")
    writeModule('chunks/deeper.js', "export const Deep = 1\nexport * from '../index.js'")
    const found = exportsOf("export * from './chunks/settings.js'")
    expect([...found.names].sort()).toEqual(['Deep', 'Settings'])
    expect(found.open).toBe(false)
  })

  it('accepts any name behind a star re-export it cannot read', () => {
    expect(hasExport(exportsOf("export * from 'some-package'"), 'Anything')).toBe(true)
    expect(hasExport(exportsOf("export * from './missing.js'"), 'Anything')).toBe(true)
  })

  it('finds no exports in a script without any and never runs it', () => {
    const found = exportsOf("globalThis.ran = true\nmodule.exports = { default: 1 }")
    expect(found.names.size).toBe(0)
    expect(hasExport(found, 'default')).toBe(false)
    expect(globalThis.ran).toBeUndefined()
  })
})
