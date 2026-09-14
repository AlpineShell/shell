const MB = 1024 ** 2
const GB = 1024 ** 3

export function formatMemory(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / MB))} MB`
}

export function processKey(target: string | null): string | null {
  if (!target) return null
  const base = target.split(/[\\/]/).pop() || ''
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}
