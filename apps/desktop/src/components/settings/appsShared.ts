const MB = 1024 ** 2
const GB = 1024 ** 3

export const ROW_ACTIONS = 'flex flex-wrap items-center gap-2 pt-1 pr-3.5 pb-3 pl-[54px]'

export function formatMemory(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / MB))} MB`
}

export function startsWithPc(entry: StartupEntry): boolean {
  return entry.pending ? entry.pending === 'enable' : entry.enabled
}

export function installedAppCount(apps: InstalledApp[]): number {
  return apps.filter((app) => !app.isComponent).length
}

export function startupAppsOnCount(entries: StartupEntry[]): number {
  return entries.filter((entry) => entry.category !== 'system' && startsWithPc(entry)).length
}

export function runningAppCount(apps: RunningApp[]): number {
  return apps.filter((app) => app.category !== 'system').length
}

export function processKey(target: string | null): string | null {
  if (!target) return null
  const base = target.split(/[\\/]/).pop() || ''
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}
