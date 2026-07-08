import { PLUGIN_ID_PATTERN, PLUGIN_PERMISSIONS, isSupportedApiVersion, type PluginPermission } from './constants'

export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export interface ValidationIssue {
  path: string
  message: string
}
export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] }

const PERMISSION_SET = new Set<string>(PLUGIN_PERMISSIONS)

export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && PLUGIN_ID_PATTERN.test(id)
}

export function isSemver(v: unknown): v is string {
  return typeof v === 'string' && SEMVER_PATTERN.test(v)
}

export function isPermission(p: unknown): p is PluginPermission {
  return typeof p === 'string' && PERMISSION_SET.has(p)
}

export function isHttpsOrigin(s: unknown): boolean {
  if (typeof s !== 'string' || !s || s === '*') return false
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.pathname !== '' && url.pathname !== '/') return false
  if (url.search || url.hash || url.username || url.password) return false
  const host = url.hostname
  if (!host) return false
  if (host.startsWith('*.')) {
    const rest = host.slice(2)
    return rest.length > 0 && rest.includes('.') && !rest.includes('*')
  }
  return !host.includes('*')
}

export function normalizeRelPath(p: string): string | null {
  if (typeof p !== 'string' || !p) return null
  if (/^([a-zA-Z]:)?[\\/]/.test(p)) return null
  const parts = p.split(/[\\/]/)
  if (parts.some((seg) => seg === '..')) return null
  if (parts[parts.length - 1] === '') return null
  return parts.filter((seg) => seg !== '.').join('/')
}

export function validateManifestShape(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  if (!raw || typeof raw !== 'object') return { ok: false, issues: [{ path: '', message: 'manifest must be an object' }] }
  const m = raw as Record<string, unknown>
  if (!isValidId(m.id)) add('id', 'must be a reverse-DNS lowercase id')
  if (typeof m.name !== 'string' || !m.name) add('name', 'required string')
  if (!isSemver(m.version)) add('version', 'must be semver 2.0.0')
  if (!Number.isInteger(m.apiVersion)) add('apiVersion', 'must be an integer')
  else if (!isSupportedApiVersion(m.apiVersion as number)) add('apiVersion', 'unsupported api version')
  for (const key of ['permissions', 'optionalPermissions'] as const) {
    const v = m[key]
    if (v == null) continue
    if (!Array.isArray(v)) {
      add(key, 'must be an array')
      continue
    }
    for (const p of v) if (!isPermission(p)) add(key, `unknown permission '${String(p)}'`)
  }
  const connect = (m.network as { connect?: unknown })?.connect
  if (connect != null) {
    if (!Array.isArray(connect)) add('network.connect', 'must be an array')
    else for (const o of connect) if (!isHttpsOrigin(o)) add('network.connect', `invalid https origin '${String(o)}'`)
  }
  return issues.length ? { ok: false, issues } : { ok: true }
}
