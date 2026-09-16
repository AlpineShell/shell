import { TIER_GAP, frecencyBoost, frecencyKey } from "./launcherSearch"

const KIND_BIAS: Record<LauncherResultKind, number> = {
  open: 800,
  app: 0,
  tab: -200,
  bookmark: -400,
  setting: -600,
  wincmd: -600,
}

const KIND_ORDER: LauncherResultKind[] = ["open", "app", "tab", "bookmark", "setting", "wincmd"]

const LEARNED_EXACT_STRENGTH = 3 * TIER_GAP
const LEARNED_REPEAT_STRENGTH = TIER_GAP
const LEARNED_MAX_STRENGTH = 6 * TIER_GAP
const LEARNED_PREFIX_SHARE = 0.5
const LEARNED_EXTENSION_SHARE = 0.25
const LEARNED_ONLY_MATCH = TIER_GAP
const MAX_QUERY_LENGTH = 64

export const EMPTY_LAUNCHER_MEMORY: LauncherMemory = { usage: {}, queries: {} }

export function normalizeLauncherQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH)
}

function strengthFor(weight: number): number {
  if (!(weight > 0)) return 0
  const firstPick = LEARNED_EXACT_STRENGTH * Math.min(1, weight)
  const repeats = LEARNED_REPEAT_STRENGTH * Math.log2(Math.max(1, weight))
  return Math.min(LEARNED_MAX_STRENGTH, firstPick + repeats)
}

function shareFor(learnedQuery: string, query: string): { share: number; anchored: boolean } {
  if (learnedQuery === query) return { share: 1, anchored: true }
  if (learnedQuery.startsWith(query)) return { share: LEARNED_PREFIX_SHARE * (query.length / learnedQuery.length), anchored: true }
  if (query.startsWith(learnedQuery)) return { share: LEARNED_EXTENSION_SHARE, anchored: false }
  return { share: 0, anchored: false }
}

export function learnedBoost(learned: Record<string, number> | undefined, rawQuery: string): { boost: number; anchored: boolean } {
  const query = normalizeLauncherQuery(rawQuery)
  if (!query || !learned) return { boost: 0, anchored: false }
  let boost = 0
  let anchored = false
  for (const [learnedQuery, weight] of Object.entries(learned)) {
    const { share, anchored: isAnchored } = shareFor(learnedQuery, query)
    const candidate = share * strengthFor(weight)
    if (candidate > boost) {
      boost = candidate
      anchored = isAnchored
    }
  }
  return { boost: Math.round(boost), anchored }
}

export function rankScore(candidate: RankCandidate, memory: LauncherMemory, query: string): number {
  const learned = learnedBoost(memory.queries[candidate.key], query)
  const match = candidate.match >= 0 ? candidate.match : learned.anchored && learned.boost > 0 ? LEARNED_ONLY_MATCH : -1
  if (match < 0) return -1
  const usage = frecencyBoost(memory.usage[candidate.key] ?? 0)
  return Math.max(0, match + learned.boost + usage + KIND_BIAS[candidate.kind])
}

export function rankEntries<T extends RankCandidate>(candidates: T[], memory: LauncherMemory, query: string): (T & { score: number })[] {
  return candidates
    .map((candidate) => ({ ...candidate, score: rankScore(candidate, memory, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
}

export function adoptInstalledAppMatch<T extends RankCandidate>(openWindow: T, installedApp: RankCandidate | undefined): T {
  if (!installedApp || installedApp.match <= openWindow.match) return openWindow
  return { ...openWindow, key: installedApp.key, match: installedApp.match }
}

export function appResultKey(target: string): string {
  return frecencyKey(target)
}

export function tabResultKey(host: string | null | undefined, title: string): string {
  return `tab:${(host || title).trim().toLowerCase()}`
}

export function settingResultKey(id: string): string {
  return `setting:${id}`
}

export function windowCommandResultKey(action: string): string {
  return `wincmd:${action}`
}
