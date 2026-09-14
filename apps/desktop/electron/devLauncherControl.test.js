import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'

const { default: devLauncherControl } = await import('./devLauncherControl.js')
const { containsQuitCommand, listenForLauncherQuit } = devLauncherControl

function fakeSocket() {
  const socket = new EventEmitter()
  socket.setEncoding = vi.fn()
  return socket
}

describe('containsQuitCommand', () => {
  it('finds the quit line on its own or among others', () => {
    expect(containsQuitCommand('quit\n')).toBe(true)
    expect(containsQuitCommand('noise\r\nquit\r\n')).toBe(true)
  })

  it('ignores anything that is not exactly the quit line', () => {
    expect(containsQuitCommand('')).toBe(false)
    expect(containsQuitCommand('quitting\n')).toBe(false)
    expect(containsQuitCommand('please quit now\n')).toBe(false)
  })
})

describe('listenForLauncherQuit', () => {
  it('does nothing outside the dev launcher', () => {
    const connect = vi.fn()
    expect(listenForLauncherQuit({ pipePath: undefined, quit: vi.fn(), connect })).toBeNull()
    expect(connect).not.toHaveBeenCalled()
  })

  it('connects to the launcher pipe and quits when asked', () => {
    const socket = fakeSocket()
    const connect = vi.fn(() => socket)
    const quit = vi.fn()
    listenForLauncherQuit({ pipePath: 'launcher-pipe', quit, connect })
    expect(connect).toHaveBeenCalledWith('launcher-pipe')
    socket.emit('data', 'hello\n')
    expect(quit).not.toHaveBeenCalled()
    socket.emit('data', 'quit\n')
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('survives a pipe error without quitting', () => {
    const socket = fakeSocket()
    const quit = vi.fn()
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    listenForLauncherQuit({ pipePath: 'launcher-pipe', quit, connect: () => socket })
    expect(() => socket.emit('error', new Error('pipe closed'))).not.toThrow()
    expect(quit).not.toHaveBeenCalled()
    logError.mockRestore()
  })
})
