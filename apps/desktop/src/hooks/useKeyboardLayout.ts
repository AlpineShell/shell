import { useEffect, useState } from 'react'
import { useShellState } from './useShellState'

const EMPTY_STATE: KeyboardLayoutState = { languages: [], defaultInputMethod: null }

async function readKeyboardLayoutState(): Promise<KeyboardLayoutState> {
  const [languages, defaultInputMethod] = await Promise.all([
    window.shell.keyboard.languages(),
    window.shell.keyboard.defaultInputMethod(),
  ])
  return { languages, defaultInputMethod }
}

function subscribeKeyboardLayoutState(callback: (state: KeyboardLayoutState) => void) {
  return window.shell.keyboard.onChanged(callback)
}

function replaceLayouts(
  state: KeyboardLayoutState,
  tag: string,
  nextLayouts: (layouts: KeyboardInputMethod[]) => KeyboardInputMethod[]
): KeyboardLayoutState {
  return {
    ...state,
    languages: state.languages.map((language) =>
      language.tag === tag ? { ...language, layouts: nextLayouts(language.layouts) } : language
    ),
  }
}

export function useKeyboardLayout() {
  const published = useShellState<KeyboardLayoutState>(
    EMPTY_STATE,
    readKeyboardLayoutState,
    subscribeKeyboardLayoutState
  )
  const [optimistic, setOptimistic] = useState<OptimisticKeyboardLayout | null>(null)
  const [availableLayouts, setAvailableLayouts] = useState<KeyboardLayoutOption[]>([])

  useEffect(() => {
    let alive = true
    window.shell.keyboard
      .availableLayouts()
      .then((layouts) => { if (alive) setAvailableLayouts(layouts) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const state = optimistic?.publishedWhenWritten === published ? optimistic.state : published

  const apply = (next: KeyboardLayoutState, write: Promise<unknown>) => {
    const pending = { publishedWhenWritten: published, state: next }
    setOptimistic(pending)
    write
      .catch(() => {})
      .finally(() => setOptimistic((current) => (current === pending ? null : current)))
  }

  const addLayout = (tag: string, layoutId: string) => {
    const language = state.languages.find((entry) => entry.tag === tag)
    const localeId = language?.localeId
    if (!language || !localeId) return
    const tip = `${localeId}:${layoutId}`
    if (language.layouts.some((layout) => layout.tip === tip)) return
    const name = availableLayouts.find((layout) => layout.id === layoutId)?.name ?? layoutId
    apply(
      replaceLayouts(state, tag, (layouts) => [...layouts, { tip, localeId, layoutId, name }]),
      window.shell.keyboard.addLayout(tag, layoutId)
    )
  }

  const removeLayout = (tag: string, tip: string) => {
    apply(
      replaceLayouts(state, tag, (layouts) => layouts.filter((layout) => layout.tip !== tip)),
      window.shell.keyboard.removeLayout(tag, tip)
    )
  }

  const reorderLayouts = (tag: string, tips: string[]) => {
    apply(
      replaceLayouts(state, tag, (layouts) => {
        const requested = tips.flatMap((tip) => layouts.filter((layout) => layout.tip === tip))
        return [...requested, ...layouts.filter((layout) => !requested.includes(layout))]
      }),
      window.shell.keyboard.reorderLayouts(tag, tips)
    )
  }

  const setDefaultInputMethod = (tip: string | null) => {
    apply({ ...state, defaultInputMethod: tip }, window.shell.keyboard.setDefaultInputMethod(tip))
  }

  const activateNow = (tip: string) => window.shell.keyboard.activateNow(tip)

  return {
    languages: state.languages,
    defaultInputMethod: state.defaultInputMethod,
    availableLayouts,
    addLayout,
    removeLayout,
    reorderLayouts,
    setDefaultInputMethod,
    activateNow,
  }
}
