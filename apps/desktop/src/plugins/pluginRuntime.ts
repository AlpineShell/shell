import * as React from 'react'
import { useDarkText, useTopbarBg } from '../components/themeContext'
import PopupMenu from '../components/topbar/shared/popupMenu'
import { registerContribution } from './pluginRegistry'

let installed = false

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

export function installPluginRuntime() {
  if (installed) return
  installed = true
  const runtime: AlpinePluginRuntime = {
    version: 2,
    React,
    h: React.createElement,
    Fragment: React.Fragment,
    useState: React.useState,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useMemo: React.useMemo,
    useCallback: React.useCallback,
    useDarkText,
    useTopbarBg,
    usePluginData,
    PopupMenu,
    register: (contribution) => registerContribution(contribution),
  }
  window.alpine = runtime
}
