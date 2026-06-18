import { useEffect, useState } from 'react'

const DEFAULT_CONFIG: NotificationsConfig = {
  enabled: true,
  doNotDisturb: false,
  position: 'top-center',
  defaultDuration: 5000,
  maxHistory: 50,
  groupBySource: true,
}

const DEFAULT_STATE: NotificationState = {
  items: [],
  unreadCount: 0,
  config: DEFAULT_CONFIG,
}

export function useNotifications() {
  const [state, setState] = useState<NotificationState>(DEFAULT_STATE)

  useEffect(() => {
    let active = true
    window.shell?.notifications?.getState?.().then((s) => { if (active && s) setState(s) })
    const offChanged = window.shell?.notifications?.onChanged?.((s) => setState(s))
    const offConfig = window.shell?.notifications?.onConfigChanged?.((config) =>
      setState((prev) => ({ ...prev, config }))
    )
    return () => {
      active = false
      offChanged?.()
      offConfig?.()
    }
  }, [])

  const setConfig = (partial: Partial<NotificationsConfig>) => {
    setState((prev) => ({ ...prev, config: { ...prev.config, ...partial } }))
    window.shell?.notifications?.setConfig?.(partial)
  }

  const setDnd = (value: boolean) => setConfig({ doNotDisturb: value })

  const dismiss = (id: number) => {
    setState((prev) => ({ ...prev, items: prev.items.filter((n) => n.id !== id) }))
    window.shell?.notifications?.dismiss?.(id)
  }

  const clearAll = () => {
    setState((prev) => ({ ...prev, items: [] }))
    window.shell?.notifications?.clearAll?.()
  }

  const markAllRead = () => {
    setState((prev) => ({ ...prev, unreadCount: 0, items: prev.items.map((n) => ({ ...n, read: true })) }))
    window.shell?.notifications?.markAllRead?.()
  }

  const runAction = (id: number, actionId: string) => {
    window.shell?.notifications?.runAction?.(id, actionId)
  }

  return {
    items: state.items,
    unreadCount: state.unreadCount,
    config: state.config,
    setConfig,
    setDnd,
    dismiss,
    clearAll,
    markAllRead,
    runAction,
  }
}
