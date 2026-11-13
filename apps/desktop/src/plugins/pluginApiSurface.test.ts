import { describe, expect, it } from 'vitest'
import { installPluginRuntime } from './pluginRuntime'

const API_1_RUNTIME = [
  'version',
  'React',
  'react',
  'reactDom',
  'jsxRuntime',
  'h',
  'html',
  'Fragment',
  'useState',
  'useEffect',
  'useRef',
  'useMemo',
  'useCallback',
  'useReducer',
  'useContext',
  'createContext',
  'useSyncExternalStore',
  'useLayoutEffect',
  'useId',
  'memo',
  'lazy',
  'Suspense',
  'startTransition',
  'useDarkText',
  'useTopbarBg',
  'usePluginData',
  'usePluginSetting',
  'sendCommand',
  'store.createStore',
  'store.useStore',
  'store.useShallow',
  'PopupMenu',
]

function valueAt(source: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((value, key) => (value == null ? undefined : (value as Record<string, unknown>)[key]), source)
}

describe('the plugin API version 1 surface', () => {
  it('still gives plugins every member of window.alpine', () => {
    installPluginRuntime()
    const missing = API_1_RUNTIME.filter((member) => valueAt(window.alpine, member) === undefined)
    expect(
      missing,
      `window.alpine no longer provides ${missing.join(', ')}. API version 1 plugins rely on this. Read "Plugin API is a public contract" in CLAUDE.md before removing or renaming it.`,
    ).toEqual([])
  })
})
