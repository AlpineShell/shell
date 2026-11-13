import { describe, expect, it, vi } from 'vitest'

const { MAX_LINES_PER_PLUGIN, RUNTIME_ERROR_SUMMARIES, createPluginLogStore, withRuntimeError } = await import('./pluginLogStore.js')

const WEATHER = 'com.example.weather'
const NOTES = 'com.example.notes'

function clockFrom(start) {
  let at = start
  return () => at++
}

describe('the plugin log', () => {
  it('keeps lines per plugin, in order, with when they were written', () => {
    const store = createPluginLogStore({ now: clockFrom(100) })
    store.add(WEATHER, { source: 'backend', level: 'info', message: 'started' })
    store.add(NOTES, { source: 'settings', level: 'info', message: 'font changed to mono' })
    store.add(WEATHER, { source: 'command', level: 'error', message: 'refresh: offline' })

    expect(store.list(WEATHER)).toEqual([
      { at: 100, source: 'backend', level: 'info', message: 'started' },
      { at: 102, source: 'command', level: 'error', message: 'refresh: offline' },
    ])
    expect(store.list(NOTES)).toHaveLength(1)
  })

  it('keeps only the last 200 lines of a plugin', () => {
    const store = createPluginLogStore()
    for (let index = 0; index < MAX_LINES_PER_PLUGIN + 5; index++) {
      store.add(WEATHER, { source: 'backend', level: 'info', message: `line ${index}` })
    }
    const lines = store.list(WEATHER)
    expect(lines).toHaveLength(MAX_LINES_PER_PLUGIN)
    expect(lines[0].message).toBe('line 5')
    expect(lines.at(-1).message).toBe(`line ${MAX_LINES_PER_PLUGIN + 4}`)
  })

  it('has nothing for a plugin that never wrote', () => {
    expect(createPluginLogStore().list(WEATHER)).toEqual([])
  })

  it('refuses a line from an unknown source or level', () => {
    const store = createPluginLogStore()
    store.add(WEATHER, { source: 'network', level: 'info', message: 'x' })
    store.add(WEATHER, { source: 'backend', level: 'debug', message: 'x' })
    store.add('', { source: 'backend', level: 'info', message: 'x' })
    expect(store.list(WEATHER)).toEqual([])
  })

  it('cuts a very long message short', () => {
    const store = createPluginLogStore()
    store.add(WEATHER, { source: 'backend', level: 'info', message: 'x'.repeat(10000) })
    expect(store.list(WEATHER)[0].message.length).toBeLessThan(5000)
  })

  it('hands out a copy, so a caller cannot change the log', () => {
    const store = createPluginLogStore()
    store.add(WEATHER, { source: 'backend', level: 'info', message: 'started' })
    store.list(WEATHER).pop()
    expect(store.list(WEATHER)).toHaveLength(1)
  })

  it('clears one plugin without touching another', () => {
    const store = createPluginLogStore()
    store.add(WEATHER, { source: 'backend', level: 'info', message: 'started' })
    store.add(NOTES, { source: 'backend', level: 'info', message: 'started' })
    store.clear(WEATHER)
    expect(store.list(WEATHER)).toEqual([])
    expect(store.list(NOTES)).toHaveLength(1)
  })
})

describe('the last runtime error of a plugin', () => {
  it('is kept until it is cleared', () => {
    const store = createPluginLogStore()
    expect(store.runtimeError(WEATHER)).toBeNull()
    store.setRuntimeError(WEATHER, RUNTIME_ERROR_SUMMARIES.backend)
    expect(store.runtimeError(WEATHER)).toBe('The backend stopped with an error.')
    store.clearRuntimeError(WEATHER)
    expect(store.runtimeError(WEATHER)).toBeNull()
  })

  it('stays when the log lines are cleared', () => {
    const store = createPluginLogStore()
    store.setRuntimeError(WEATHER, RUNTIME_ERROR_SUMMARIES.widget)
    store.clear(WEATHER)
    expect(store.runtimeError(WEATHER)).toBe('The widget stopped with an error.')
  })

  it('goes for every plugin at once on a reload', () => {
    const store = createPluginLogStore()
    store.setRuntimeError(WEATHER, RUNTIME_ERROR_SUMMARIES.widget)
    store.setRuntimeError(NOTES, RUNTIME_ERROR_SUMMARIES.backend)
    store.clearAllRuntimeErrors()
    expect(store.runtimeError(WEATHER)).toBeNull()
    expect(store.runtimeError(NOTES)).toBeNull()
  })

  it('goes with the lines when a plugin is forgotten', () => {
    const store = createPluginLogStore()
    store.add(WEATHER, { source: 'backend', level: 'error', message: 'boom' })
    store.setRuntimeError(WEATHER, RUNTIME_ERROR_SUMMARIES.backend)
    store.forget(WEATHER)
    expect(store.list(WEATHER)).toEqual([])
    expect(store.runtimeError(WEATHER)).toBeNull()
  })

  it('is announced once while it stays the same', () => {
    const store = createPluginLogStore()
    const listener = vi.fn()
    store.onRuntimeError(listener)
    store.setRuntimeError(WEATHER, RUNTIME_ERROR_SUMMARIES.widget)
    store.setRuntimeError(WEATHER, RUNTIME_ERROR_SUMMARIES.widget)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(WEATHER, RUNTIME_ERROR_SUMMARIES.widget)

    store.clearRuntimeError(WEATHER)
    store.setRuntimeError(WEATHER, RUNTIME_ERROR_SUMMARIES.widget)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('is merged into a plugin record', () => {
    const store = createPluginLogStore()
    store.setRuntimeError(WEATHER, RUNTIME_ERROR_SUMMARIES.backend)
    expect(withRuntimeError({ id: WEATHER, name: 'Weather' }, store)).toEqual({
      id: WEATHER,
      name: 'Weather',
      runtimeError: 'The backend stopped with an error.',
    })
    expect(withRuntimeError({ id: NOTES, name: 'Notes' }, store).runtimeError).toBeNull()
  })
})
