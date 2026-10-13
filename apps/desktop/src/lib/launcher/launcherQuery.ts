import { TIER_GAP, scoreField, scoreItem } from "../launcherSearch"
import { rankScore } from "../launcherRanking"
import { calculate } from "./launcherCalculator"

export const SEMANTIC_MIN_QUERY_LENGTH = 3
export const SEMANTIC_THRESHOLD = 0.4
export const WINDOW_SECTION_LIMIT = 5

const SEMANTIC_FULL_STRENGTH = 0.75
const SEMANTIC_BASE_TIERS = 2
const SEMANTIC_TIER_SPAN = 1.5
const SEMANTIC_TIEBREAK = 1500
const CONTAINED_PHRASE_SCORE = 3 * TIER_GAP
const CONTAINED_PHRASE_MIN_LENGTH = 3
const FALLBACK_BELOW_RESULTS = 3
const FALLBACK_MIN_QUERY_LENGTH = 2
const PINNED_RUN_KINDS = new Set<RunResult["kind"]>(["folder", "file", "url"])

type GroupedSection = Exclude<LauncherEntrySection, "windows">

const SECTION_LIMITS: Record<GroupedSection, number> = {
  apps: 5,
  commands: 4,
  settings: 5,
  bookmarks: 3,
}

type EntryRow = Extract<LauncherRow, { kind: "entry" }>

function searchWords(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function containsPhrase(queryWords: string[], phrase: string): boolean {
  const phraseWords = searchWords(phrase)
  if (phraseWords.length === 0 || phraseWords.length >= queryWords.length) return false
  if (phraseWords.join(" ").length < CONTAINED_PHRASE_MIN_LENGTH) return false
  for (let start = 0; start + phraseWords.length <= queryWords.length; start++) {
    if (phraseWords.every((word, offset) => queryWords[start + offset] === word)) return true
  }
  return false
}

function containedPhraseScore(entry: LauncherEntry, queryWords: string[]): number {
  if (queryWords.length < 2) return -1
  let best = -1
  const phrases = entry.fields ? [entry.fields.name, ...entry.fields.aliases] : []
  for (const phrase of phrases) {
    if (containsPhrase(queryWords, phrase)) best = Math.max(best, CONTAINED_PHRASE_SCORE)
  }
  for (const { text, penalty } of entry.terms) {
    if (containsPhrase(queryWords, text)) best = Math.max(best, CONTAINED_PHRASE_SCORE - penalty)
  }
  return best
}

export function lexicalScore(entry: LauncherEntry, query: string): number {
  let best = entry.fields ? scoreItem(query, entry.fields) : -1
  for (const { text, penalty, minScore } of entry.terms) {
    const score = scoreField(query, text)
    if (score >= minScore) best = Math.max(best, score - penalty)
  }
  return Math.max(best, containedPhraseScore(entry, searchWords(query)))
}

export function semanticScore(similarity: number): number {
  if (!(similarity >= SEMANTIC_THRESHOLD)) return -1
  const strength = Math.min(1, (similarity - SEMANTIC_THRESHOLD) / (SEMANTIC_FULL_STRENGTH - SEMANTIC_THRESHOLD))
  return Math.round(TIER_GAP * (SEMANTIC_BASE_TIERS + SEMANTIC_TIER_SPAN * strength))
}

function semanticQueryVector(query: string, semantic: SemanticIndex | null): Float32Array | null {
  if (!semantic || query.length < SEMANTIC_MIN_QUERY_LENGTH) return null
  return semantic.embedQuery(query)
}

function semanticTiebreak(similarity: number): number {
  return Math.round(SEMANTIC_TIEBREAK * Math.max(0, similarity))
}

function scoreEntry(entry: LauncherEntry, query: string, queryVector: Float32Array | null, context: LauncherSearchContext): EntryRow | null {
  const lexical = lexicalScore(entry, query)
  const similarity = queryVector && entry.semanticText && context.semantic
    ? context.semantic.similarity(queryVector, entry.semanticText)
    : 0
  const semantic = semanticScore(similarity)
  const lexicalWithTiebreak = lexical >= 0 ? lexical + semanticTiebreak(similarity) : -1
  const match = Math.max(lexicalWithTiebreak, semantic)
  const score = rankScore({ kind: entry.kind, key: entry.rankKey, match }, context.memory, query)
  if (score < 0) return null
  return { kind: "entry", id: entry.id, entry, score, semantic: semantic > lexicalWithTiebreak }
}

function byScore(a: EntryRow, b: EntryRow): number {
  return b.score - a.score || a.entry.title.localeCompare(b.entry.title)
}

function isStoodInForByWindow(row: EntryRow, windows: EntryRow[]): boolean {
  if (row.entry.kind !== "app") return false
  const name = row.entry.title.toLowerCase()
  return windows.some(({ entry }) => entry.kind === "window" && (entry.rankKey === row.entry.rankKey || entry.title.toLowerCase() === name))
}

function groupBySection(rows: EntryRow[], windows: EntryRow[]): LauncherSection[] {
  const grouped = new Map<GroupedSection, EntryRow[]>()
  for (const row of rows) {
    const section = row.entry.section
    if (section === "windows" || isStoodInForByWindow(row, windows)) continue
    const sectionRows = grouped.get(section) ?? []
    if (sectionRows.length < SECTION_LIMITS[section]) sectionRows.push(row)
    grouped.set(section, sectionRows)
  }
  return [...grouped.entries()]
    .filter(([, sectionRows]) => sectionRows.length > 0)
    .sort(([, a], [, b]) => (b[0] as EntryRow).score - (a[0] as EntryRow).score)
    .map(([id, sectionRows]) => ({ id, rows: sectionRows }))
}

function takeWithinBudget(sections: LauncherSection[], budget: number): { taken: LauncherSection[]; left: number } {
  const taken: LauncherSection[] = []
  let left = budget
  for (const section of sections) {
    if (left <= 0) break
    const rows = section.rows.slice(0, left)
    taken.push({ id: section.id, rows })
    left -= rows.length
  }
  return { taken, left }
}

function entryRowCount(sections: LauncherSection[]): number {
  return sections.reduce((count, section) => count + section.rows.filter((row) => row.kind === "entry").length, 0)
}

export function searchLauncher(entries: readonly LauncherEntry[], rawQuery: string, context: LauncherSearchContext): LauncherSection[] {
  const query = rawQuery.trim()
  if (!query) return []

  const queryVector = semanticQueryVector(query, context.semantic)
  const scored: EntryRow[] = []
  for (const entry of entries) {
    const row = scoreEntry(entry, query, queryVector, context)
    if (row) scored.push(row)
  }
  scored.sort(byScore)

  const windows = scored.filter((row) => row.entry.section === "windows").slice(0, WINDOW_SECTION_LIMIT)
  const entrySections: LauncherSection[] = [
    ...(windows.length > 0 ? [{ id: "windows" as const, rows: windows }] : []),
    ...groupBySection(scored, windows),
  ]

  const sections: LauncherSection[] = []
  let budget = Math.max(1, context.maxResults)

  const mathValue = calculate(query)
  if (mathValue) {
    sections.push({ id: "calculator", rows: [{ kind: "math", id: "math", value: mathValue }] })
    budget--
  }

  const run = context.run
  const pinRun = !!run && PINNED_RUN_KINDS.has(run.kind)
  if (run && pinRun && budget > 0) {
    sections.push({ id: "run", rows: [{ kind: "run", id: "run", query, run }] })
    budget--
  }

  const { taken, left } = takeWithinBudget(entrySections, budget)
  sections.push(...taken)

  if (run && !pinRun && left > 0) sections.push({ id: "run", rows: [{ kind: "run", id: "run", query, run }] })

  if (!mathValue && query.length >= FALLBACK_MIN_QUERY_LENGTH && entryRowCount(sections) < FALLBACK_BELOW_RESULTS) {
    sections.push({ id: "web", rows: [{ kind: "web", id: "web", query }] })
  }
  return sections
}

export function flattenRows(sections: readonly LauncherSection[]): LauncherRow[] {
  return sections.flatMap((section) => section.rows)
}
