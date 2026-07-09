export const PLUGIN_API_VERSION = 1 as const

export const SUPPORTED_API_VERSIONS: readonly number[] = [1]

export const PLUGIN_ID_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export const MARKETPLACE_CATEGORIES = [
  'productivity', 'system', 'media', 'developer', 'social', 'fun', 'other',
] as const

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]

export function isSupportedApiVersion(v: number): boolean {
  return SUPPORTED_API_VERSIONS.includes(v)
}

function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function satisfiesRange(version: string, range: string): boolean {
  const v = parseVersion(version)
  if (!v) return false
  const r = (range || '').trim()
  if (r === '' || r === '*') return true
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  if (r.startsWith('^')) {
    const b = parseVersion(r.slice(1))
    if (!b) return false
    return cmp(v, b) >= 0 && (b[0] > 0 ? v[0] === b[0] : b[1] > 0 ? v[0] === 0 && v[1] === b[1] : v[0] === 0 && v[1] === 0 && v[2] === b[2])
  }
  if (r.startsWith('~')) {
    const b = parseVersion(r.slice(1))
    if (!b) return false
    return cmp(v, b) >= 0 && v[0] === b[0] && v[1] === b[1]
  }
  if (r.startsWith('>=')) { const b = parseVersion(r.slice(2)); return b ? cmp(v, b) >= 0 : false }
  if (r.startsWith('<=')) { const b = parseVersion(r.slice(2)); return b ? cmp(v, b) <= 0 : false }
  if (r.startsWith('>')) { const b = parseVersion(r.slice(1)); return b ? cmp(v, b) > 0 : false }
  if (r.startsWith('<')) { const b = parseVersion(r.slice(1)); return b ? cmp(v, b) < 0 : false }
  const b = parseVersion(r)
  return b ? cmp(v, b) === 0 : false
}
