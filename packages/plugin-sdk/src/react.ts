import { hostReact } from './host'

const R = hostReact() as unknown as Record<string, unknown>

export const useState = R.useState as typeof import('react').useState
export const useEffect = R.useEffect as typeof import('react').useEffect
export const useRef = R.useRef as typeof import('react').useRef
export const useMemo = R.useMemo as typeof import('react').useMemo
export const useCallback = R.useCallback as typeof import('react').useCallback
export const useReducer = R.useReducer as typeof import('react').useReducer
export const useContext = R.useContext as typeof import('react').useContext
export const createElement = R.createElement as typeof import('react').createElement
export const Fragment = R.Fragment as typeof import('react').Fragment
