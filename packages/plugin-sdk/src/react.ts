import htm from 'htm'
import { getHost, hostReact, type AlpineHtml } from './host'

const R = hostReact() as unknown as Record<string, unknown>

export const useState = R.useState as typeof import('react').useState
export const useEffect = R.useEffect as typeof import('react').useEffect
export const useRef = R.useRef as typeof import('react').useRef
export const useMemo = R.useMemo as typeof import('react').useMemo
export const useCallback = R.useCallback as typeof import('react').useCallback
export const useReducer = R.useReducer as typeof import('react').useReducer
export const useContext = R.useContext as typeof import('react').useContext
export const createContext = R.createContext as typeof import('react').createContext
export const useSyncExternalStore = R.useSyncExternalStore as typeof import('react').useSyncExternalStore
export const useLayoutEffect = R.useLayoutEffect as typeof import('react').useLayoutEffect
export const useId = R.useId as typeof import('react').useId
export const memo = R.memo as typeof import('react').memo
export const lazy = R.lazy as typeof import('react').lazy
export const Suspense = R.Suspense as typeof import('react').Suspense
export const startTransition = R.startTransition as typeof import('react').startTransition
export const createElement = R.createElement as typeof import('react').createElement
export const Fragment = R.Fragment as typeof import('react').Fragment

export const html: AlpineHtml = getHost().html ?? (htm.bind(hostReact().createElement) as AlpineHtml)
