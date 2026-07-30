import { describe, expect, it } from 'vitest'
import path from 'path'

const { launchCommand, openCommand } = await import('./shellLaunch.js')

const PACKAGED_EXE = path.join('C:', 'Program Files', 'Alpine Shell', 'Alpine Shell.exe')
const DEV_EXE = path.join('C:', 'repo', 'node_modules', 'electron', 'dist', 'electron.exe')
const APP_DIR = path.join('C:', 'repo', 'apps', 'desktop')

describe('shell launch command', () => {
  it('is just the exe for a packaged run', () => {
    const launch = launchCommand({ execPath: PACKAGED_EXE, argv: [PACKAGED_EXE], runsFromSource: false })
    expect(launch).toEqual({ target: PACKAGED_EXE, args: [] })
  })

  it('carries the app directory when the shell runs from source', () => {
    const launch = launchCommand({ execPath: DEV_EXE, argv: [DEV_EXE, APP_DIR], runsFromSource: true })
    expect(launch).toEqual({ target: DEV_EXE, args: [APP_DIR] })
  })

  it('resolves a relative app path, because a shortcut has its own working directory', () => {
    const launch = launchCommand({ execPath: DEV_EXE, argv: [DEV_EXE, '.'], runsFromSource: true })
    expect(launch.args).toEqual([path.resolve('.')])
  })

  it('omits the app directory when argv does not carry one', () => {
    expect(launchCommand({ execPath: DEV_EXE, argv: [DEV_EXE], runsFromSource: true }).args).toEqual([])
    expect(launchCommand({ execPath: DEV_EXE, argv: null, runsFromSource: true }).args).toEqual([])
  })
})

describe('opening a url through the shell', () => {
  const url = 'alpine-shell://open-app?plugin=com.alpine.android&app=com.supercell.brawlstars'

  it('passes the url as the only argument of a packaged run', () => {
    const launch = launchCommand({ execPath: PACKAGED_EXE, argv: [PACKAGED_EXE], runsFromSource: false })
    expect(openCommand(launch, url)).toEqual({ target: PACKAGED_EXE, args: [url] })
  })

  it('keeps the url behind the app directory when running from source', () => {
    const launch = launchCommand({ execPath: DEV_EXE, argv: [DEV_EXE, APP_DIR], runsFromSource: true })
    expect(openCommand(launch, url)).toEqual({ target: DEV_EXE, args: [APP_DIR, url] })
  })

  it('does not mutate the launch command it was given', () => {
    const launch = launchCommand({ execPath: DEV_EXE, argv: [DEV_EXE, APP_DIR], runsFromSource: true })
    openCommand(launch, url)
    openCommand(launch, url)
    expect(launch.args).toEqual([APP_DIR])
  })
})
