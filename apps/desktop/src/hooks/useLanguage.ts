import { useCallback, useEffect, useState } from 'react'

export function useLanguage() {
  const [state, setState] = useState<LanguageState | null>(null)
  const [catalog, setCatalog] = useState<LanguageCatalog | null>(null)
  const [active, setActive] = useState<ActiveInputMethod | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const apply = (next: LanguageState) => {
      if (alive) setState(next)
    }
    window.shell?.language?.state?.().then(apply).catch(() => {})
    window.shell?.language?.catalog?.().then((next) => { if (alive) setCatalog(next) }).catch(() => {})
    window.shell?.language?.active?.().then((next) => { if (alive) setActive(next) }).catch(() => {})
    const unsubscribe = window.shell?.language?.onStateChanged?.(apply)
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])

  const refreshActive = useCallback(() => {
    window.shell?.language?.active?.().then(setActive).catch(() => {})
  }, [])

  const run = useCallback((operation: () => Promise<LanguageState> | undefined) => {
    const pending = operation()
    if (!pending) return
    setBusy(true)
    pending
      .then(setState)
      .catch(() => {})
      .finally(() => setBusy(false))
  }, [])

  const setLanguages = useCallback((tags: string[]) => run(() => window.shell?.language?.setLanguages?.(tags)), [run])
  const setInputMethods = useCallback((tag: string, tips: string[]) => run(() => window.shell?.language?.setInputMethods?.(tag, tips)), [run])
  const setDefaultInput = useCallback((tip: string) => run(() => window.shell?.language?.setDefaultInput?.(tip)), [run])
  const setDisplayLanguage = useCallback((tag: string | null) => run(() => window.shell?.language?.setDisplayLanguage?.(tag)), [run])
  const setRegionalFormat = useCallback((tag: string) => run(() => window.shell?.language?.setRegionalFormat?.(tag)), [run])
  const setHomeLocation = useCallback((geoId: number) => run(() => window.shell?.language?.setHomeLocation?.(geoId)), [run])

  const activateInput = useCallback(
    (tip: string) =>
      (window.shell?.language?.activateInput?.(tip) ?? Promise.resolve(false))
        .then((ok) => {
          refreshActive()
          return ok
        })
        .catch(() => false),
    [refreshActive]
  )

  return {
    state,
    catalog,
    active,
    busy,
    setLanguages,
    setInputMethods,
    setDefaultInput,
    setDisplayLanguage,
    setRegionalFormat,
    setHomeLocation,
    activateInput,
  }
}
