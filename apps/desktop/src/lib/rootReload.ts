const MAX_ROOT_RELOADS = 3
const FIRST_ROOT_RELOAD_DELAY_MS = 1000

export function parseRootReloadCount(value: string | null): number {
  const count = Number(value)
  return Number.isInteger(count) && count > 0 ? count : 0
}

export function planRootReload(previousReloads: number): RootReloadPlan {
  if (previousReloads >= MAX_ROOT_RELOADS) return { reload: false, delayMs: 0 }
  return { reload: true, delayMs: FIRST_ROOT_RELOAD_DELAY_MS * 2 ** previousReloads }
}
