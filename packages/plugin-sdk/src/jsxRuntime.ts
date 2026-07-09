import { getHost, hostReact } from './host'

interface JsxRuntime {
  jsx: (type: unknown, props: unknown, key?: unknown) => unknown
  jsxs: (type: unknown, props: unknown, key?: unknown) => unknown
  Fragment: unknown
}

function resolveRuntime(): JsxRuntime {
  const host = getHost()
  if (host.jsxRuntime) return host.jsxRuntime as JsxRuntime
  const R = hostReact()
  const create = (type: unknown, props: unknown, key?: unknown) => {
    const p = (props || {}) as Record<string, unknown>
    const { children, ...rest } = p
    const withKey = key != null ? { ...rest, key } : rest
    return (R.createElement as (...a: unknown[]) => unknown)(type, withKey, children)
  }
  return { jsx: create, jsxs: create, Fragment: R.Fragment }
}

const rt = resolveRuntime()

export const jsx = rt.jsx
export const jsxs = rt.jsxs
export const Fragment = rt.Fragment

export function jsxDEV(type: unknown, props: unknown, key?: unknown): unknown {
  return rt.jsx(type, props, key)
}
