import { describe, expect, it } from 'vitest'

const { consoleReport } = await import('./pluginWindowConsole.js')

describe('reporting what a plugin window logged', () => {
  it('reads the event-object signature', () => {
    const event = {
      level: 'error',
      message: 'Uncaught EvalError: Code generation from strings disallowed for this context',
      lineNumber: 54,
      sourceId: 'node_modules/@protobufjs/codegen/index.js',
    }
    expect(consoleReport([event])).toBe(
      'error: Uncaught EvalError: Code generation from strings disallowed for this context (node_modules/@protobufjs/codegen/index.js:54)',
    )
  })

  it('reads the positional signature', () => {
    expect(consoleReport([{}, 2, 'something went wrong', 12, 'window/preload.js'])).toBe(
      'warning: something went wrong (window/preload.js:12)',
    )
  })

  it('names a numeric level', () => {
    expect(consoleReport([{}, 0, 'chatty', 1, 'a.js'])).toMatch(/^verbose: /)
    expect(consoleReport([{}, 1, 'note', 1, 'a.js'])).toMatch(/^info: /)
    expect(consoleReport([{}, 3, 'bad', 1, 'a.js'])).toMatch(/^error: /)
  })

  it('drops the dev-only Electron security warning, which is not the plugin talking', () => {
    expect(consoleReport([{ level: 'warning', message: 'Electron Security Warning (Insecure CSP)' }])).toBeNull()
  })

  it('omits the location when there is none', () => {
    expect(consoleReport([{ level: 'info', message: 'plain' }])).toBe('info: plain')
  })

  it('reports nothing for an unrecognised or empty event', () => {
    expect(consoleReport([])).toBeNull()
    expect(consoleReport([{}])).toBeNull()
    expect(consoleReport([{ level: 'error', message: '' }])).toBeNull()
    expect(consoleReport(null)).toBeNull()
  })
})
