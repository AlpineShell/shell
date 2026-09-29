import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import shellExecute from './shellExecute.js'

const { splitCommandLine, startProcessCommand } = shellExecute

let fixtureDir
let spacedExecutable

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine shell exec '))
  spacedExecutable = path.join(fixtureDir, 'my app.exe')
  fs.writeFileSync(spacedExecutable, '')
})

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true })
})

describe('splitCommandLine', () => {
  it('returns an empty file for blank input', () => {
    expect(splitCommandLine('')).toEqual({ file: '', args: '' })
    expect(splitCommandLine(null)).toEqual({ file: '', args: '' })
  })

  it('splits a quoted path from its arguments', () => {
    expect(splitCommandLine('"C:\\Program Files\\App\\app.exe" --start /min')).toEqual({
      file: 'C:\\Program Files\\App\\app.exe',
      args: '--start /min',
    })
  })

  it('keeps an unterminated quoted path whole', () => {
    expect(splitCommandLine('"C:\\Program Files\\App\\app.exe')).toEqual({
      file: 'C:\\Program Files\\App\\app.exe',
      args: '',
    })
  })

  it('keeps an unquoted existing path with spaces whole', () => {
    expect(splitCommandLine(spacedExecutable)).toEqual({ file: spacedExecutable, args: '' })
  })

  it('splits an unquoted existing path with spaces from its arguments', () => {
    expect(splitCommandLine(`${spacedExecutable} --background`)).toEqual({
      file: spacedExecutable,
      args: '--background',
    })
  })

  it('falls back to the first space when nothing on disk matches', () => {
    expect(splitCommandLine('alpine-no-such-binary.exe --flag one')).toEqual({
      file: 'alpine-no-such-binary.exe',
      args: '--flag one',
    })
  })

  it('returns the whole token when there is no space', () => {
    expect(splitCommandLine('alpine-no-such-binary.exe')).toEqual({ file: 'alpine-no-such-binary.exe', args: '' })
  })
})

describe('startProcessCommand', () => {
  it('starts a file, with its arguments when there are any', () => {
    expect(startProcessCommand('app.exe', null, null)).toBe("Start-Process -FilePath 'app.exe'")
    expect(startProcessCommand('app.exe', '--flag one', null)).toBe("Start-Process -FilePath 'app.exe' -ArgumentList '--flag one'")
  })

  it('asks Windows for elevation with the runas verb', () => {
    expect(startProcessCommand('Tool.lnk', null, 'runas')).toBe("Start-Process -FilePath 'Tool.lnk' -Verb 'runas'")
  })

  it('keeps a typographic apostrophe in a shortcut name inside the string', () => {
    expect(startProcessCommand('O\u2019Brien\u2019s Tool.lnk', null, 'runas')).toBe("Start-Process -FilePath 'O\u2019\u2019Brien\u2019\u2019s Tool.lnk' -Verb 'runas'")
  })
})
