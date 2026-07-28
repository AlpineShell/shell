import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as jsxRuntime from 'react/jsx-runtime'
import htm from 'htm'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useDarkText, useTopbarBg } from '../components/themeContext'
import PopupMenu from '../components/topbar/shared/popupMenu'

let installed = false

const html = htm.bind(React.createElement) as AlpineHtml

function usePluginData<T>(channel: string, initial: T): T {
  const [value, setValue] = React.useState<T>(initial)
  React.useEffect(() => {
    let alive = true
    window.plugins
      .getData(channel)
      .then((data) => {
        if (alive && data != null) setValue(data as T)
      })
      .catch(() => {})
    const off = window.plugins.onData(channel, (data) => {
      if (alive) setValue(data as T)
    })
    return () => {
      alive = false
      off()
    }
  }, [channel])
  return value
}

function sendCommand(pluginId: string, name: string, payload?: unknown): Promise<PluginCommandResult> {
  return window.plugins.command(pluginId, name, payload)
}

export function installPluginRuntime() {
  if (installed) return
  installed = true
  const runtime: AlpinePluginRuntime = {
    version: 3,
    React,
    react: React,
    reactDom: ReactDOM,
    jsxRuntime,
    h: React.createElement,
    html,
    Fragment: React.Fragment,
    useState: React.useState,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useMemo: React.useMemo,
    useCallback: React.useCallback,
    useReducer: React.useReducer,
    useContext: React.useContext,
    createContext: React.createContext,
    useSyncExternalStore: React.useSyncExternalStore,
    useLayoutEffect: React.useLayoutEffect,
    useId: React.useId,
    memo: React.memo,
    lazy: React.lazy,
    Suspense: React.Suspense,
    startTransition: React.startTransition,
    useDarkText,
    useTopbarBg,
    usePluginData,
    sendCommand,
    store: { createStore, useStore, useShallow },
    PopupMenu,
  }
  window.alpine = runtime
}
