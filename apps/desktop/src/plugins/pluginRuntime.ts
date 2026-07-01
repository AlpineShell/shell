import * as React from 'react'
import { useDarkText, useTopbarBg } from '../components/themeContext'
import { registerContribution } from './pluginRegistry'

let installed = false

export function installPluginRuntime() {
  if (installed) return
  installed = true
  const runtime: AlpinePluginRuntime = {
    version: 1,
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
    register: (contribution) => registerContribution(contribution),
  }
  window.alpine = runtime
}
