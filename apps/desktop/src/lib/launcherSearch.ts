import { launcherAliases } from "./launcherAliases"

const SEPARATORS = new Set([" ", "/", "\\", "_", "-", ".", ":"])

const MATCH = 16
const CONSECUTIVE = 4
const CAMEL = 7
const NONWORD = 8
const BOUNDARY_WHITE = 10
const BOUNDARY_DELIM = 9
const BOUNDARY_DELIM_HARD = 10
const SAME_CASE = 1
const FIRST_CHAR_MULTIPLIER = 2
const GAP_START = -3
const GAP_EXTENSION = -1
const LEAD_START = -3
const LEAD_EXTENSION = -1
const MAX_LEAD_PENALTY = -9

export const TIER_GAP = 10_000

const TIER_EXACT = 6
const TIER_PREFIX_EXACT = 5
const TIER_PREFIX = 4
const TIER_WORD_PREFIX = 3
const TIER_BOUNDARY = 2
const TIER_SCATTERED = 1

const TYPO_MIN_QUERY_LENGTH = 4
const TYPO_LONG_QUERY_LENGTH = 8
const TYPO_FINE_BASE = 900
const TYPO_EDIT_COST = 300
const OUT_OF_ORDER_PENALTY = 12

const FRECENCY_CAP = TIER_GAP / 2
const FRECENCY_REFERENCE = 5000
const MAX_FINE = TIER_GAP - FRECENCY_CAP - 1

function isUpper(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase()
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9"
}

function boundaryBonus(prev: string, cur: string): number {
  if (/\s/.test(prev)) return BOUNDARY_WHITE
  if (prev === "/" || prev === "\\") return BOUNDARY_DELIM_HARD
  if (SEPARATORS.has(prev)) return BOUNDARY_DELIM
  const camel = (!isUpper(prev) && isUpper(cur)) || (!isDigit(prev) && isDigit(cur))
  if (camel) return CAMEL
  if (!/[a-z0-9]/i.test(prev)) return NONWORD
  return 0
}

function classBonus(target: string, i: number): number {
  if (i === 0) return BOUNDARY_WHITE
  return boundaryBonus(target[i - 1], target[i])
}

function matchIndices(query: string, target: string): number[] | null {
  const idx: number[] = []
  let qi = 0
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      idx.push(ti)
      qi++
    }
  }
  return qi === query.length ? idx : null
}

function fineScore(query: string, target: string, idx: number[]): number {
  let fine = 0
  let prevIdx = -2
  let runBonus = 0
  if (idx[0] > 0) {
    const lead = LEAD_START + LEAD_EXTENSION * (idx[0] - 1)
    fine += Math.max(MAX_LEAD_PENALTY, lead)
  }
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]
    let bonus = classBonus(target, i)
    if (i === prevIdx + 1) {
      runBonus = Math.max(runBonus, bonus)
      fine += MATCH + CONSECUTIVE + runBonus
    } else {
      runBonus = bonus
      if (k === 0) bonus *= FIRST_CHAR_MULTIPLIER
      fine += MATCH + bonus
      if (k > 0) {
        const gap = i - prevIdx - 1
        fine += GAP_START + GAP_EXTENSION * Math.max(0, gap - 1)
      }
    }
    if (target[i] === query[k]) fine += SAME_CASE
    prevIdx = i
  }
  fine += Math.round((query.length / target.length) * 50)
  return Math.min(MAX_FINE, Math.max(0, fine))
}

function wordStartOccurrence(lowerQuery: string, lowerTarget: string, target: string): number {
  for (let at = lowerTarget.indexOf(lowerQuery); at >= 0; at = lowerTarget.indexOf(lowerQuery, at + 1)) {
    if (classBonus(target, at) > 0) return at
  }
  return -1
}

export function scoreField(query: string, target: string, fieldPenalty = 0): number {
  if (query.length === 0) return TIER_SCATTERED * TIER_GAP
  if (target.length === 0) return -1
  const lowerQuery = query.toLowerCase()
  const lowerTarget = target.toLowerCase()
  let idx = matchIndices(lowerQuery, lowerTarget)
  if (!idx) return -1

  const wordStart = wordStartOccurrence(lowerQuery, lowerTarget, target)
  let tier: number
  if (lowerTarget === lowerQuery) tier = TIER_EXACT
  else if (target.startsWith(query)) tier = TIER_PREFIX_EXACT
  else if (lowerTarget.startsWith(lowerQuery)) tier = TIER_PREFIX
  else if (wordStart > 0) {
    tier = TIER_WORD_PREFIX
    idx = Array.from({ length: lowerQuery.length }, (_unused, offset) => wordStart + offset)
  } else {
    const allAtBoundary = idx.every((i) => classBonus(target, i) > 0)
    const firstAtBoundary = classBonus(target, idx[0]) > 0
    tier = allAtBoundary ? TIER_WORD_PREFIX : firstAtBoundary ? TIER_BOUNDARY : TIER_SCATTERED
  }

  const fine = Math.max(0, fineScore(query, target, idx) - fieldPenalty)
  return tier * TIER_GAP + fine
}

const FIELD_PENALTY = {
  name: 0,
  alias: 2,
  exe: 4,
  fusion: 6,
  acronym: 8,
} as const

function isPathTarget(target: string): boolean {
  if (!target) return false
  if (target.includes("!")) return false
  return /[\\/]/.test(target) || /\.(exe|lnk|url)$/i.test(target)
}

export function exeBasename(target: string): string | null {
  if (!isPathTarget(target)) return null
  const stripped = target.replace(/^["']|["']$/g, "").trim()
  const base = stripped.split(/[\\/]/).pop() ?? ""
  const noExt = base.replace(/\.(exe|lnk|url)$/i, "")
  return noExt.length > 0 ? noExt : null
}

function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
}

function deriveFusions(words: string[]): string[] {
  if (words.length < 2) return []
  const out = [words.join("")]
  for (let i = 1; i < words.length; i++) {
    out.push(words.slice(0, i).map((w) => w[0]).join("") + words.slice(i).join(""))
  }
  return Array.from(new Set(out))
}

export interface SearchFields {
  name: string
  words: string[]
  exe: string | null
  acronym: string | null
  fusions: string[]
  aliases: string[]
}

export function deriveFields(item: { name: string; target: string }): SearchFields {
  const words = nameWords(item.name)
  const acronym = words.length >= 2 ? words.map((w) => w[0]).join("") : null
  const aliasTerms: string[] = []
  const lowerName = item.name.toLowerCase()
  for (const rule of launcherAliases) {
    const hit = typeof rule.match === "string" ? lowerName.includes(rule.match) : rule.match.test(lowerName)
    if (hit) aliasTerms.push(...rule.terms)
  }
  return {
    name: item.name,
    words: words.map((word) => word.toLowerCase()),
    exe: exeBasename(item.target),
    acronym,
    fusions: deriveFusions(words),
    aliases: Array.from(new Set(aliasTerms)),
  }
}

function scoreAlias(query: string, term: string): number {
  const lowerQuery = query.toLowerCase()
  const lowerTerm = term.toLowerCase()
  if (lowerTerm === lowerQuery) return TIER_BOUNDARY * TIER_GAP - FIELD_PENALTY.alias
  if (lowerTerm.startsWith(lowerQuery)) return TIER_SCATTERED * TIER_GAP - FIELD_PENALTY.alias
  return -1
}

function editDistanceWithin(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  const rows = a.length + 1
  const cols = b.length + 1
  const distance: number[][] = Array.from({ length: rows }, (_row, i) => Array.from({ length: cols }, (_col, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i < rows; i++) {
    let rowMinimum = Infinity
    for (let j = 1; j < cols; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(distance[i - 1][j] + 1, distance[i][j - 1] + 1, distance[i - 1][j - 1] + substitution)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, distance[i - 2][j - 2] + 1)
      distance[i][j] = value
      rowMinimum = Math.min(rowMinimum, value)
    }
    if (rowMinimum > limit) return limit + 1
  }
  return distance[rows - 1][cols - 1]
}

function typoCandidates(fields: SearchFields): string[] {
  return [fields.name.toLowerCase(), ...fields.words, ...(fields.exe ? [fields.exe.toLowerCase()] : []), ...fields.aliases]
}

function scoreTypo(query: string, fields: SearchFields): number {
  if (query.length < TYPO_MIN_QUERY_LENGTH) return -1
  const lowerQuery = query.toLowerCase()
  const limit = query.length >= TYPO_LONG_QUERY_LENGTH ? 2 : 1
  let fewestEdits = limit + 1
  for (const candidate of typoCandidates(fields)) {
    for (let length = lowerQuery.length - limit; length <= lowerQuery.length + limit; length++) {
      if (length < 1 || length > candidate.length) continue
      fewestEdits = Math.min(fewestEdits, editDistanceWithin(lowerQuery, candidate.slice(0, length), limit))
    }
  }
  if (fewestEdits > limit) return -1
  return TYPO_FINE_BASE - fewestEdits * TYPO_EDIT_COST
}

function scoreWordsInAnyOrder(query: string, fields: SearchFields): number {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length < 2 || fields.words.length < 2) return -1
  let weakest = Infinity
  for (const token of tokens) {
    const tokenBest = fields.words.reduce((best, word) => Math.max(best, scoreField(token, word)), -1)
    if (tokenBest < 0) return -1
    weakest = Math.min(weakest, tokenBest)
  }
  const cappedTier = Math.min(Math.floor(weakest / TIER_GAP), TIER_BOUNDARY)
  const fine = Math.max(0, (weakest % TIER_GAP) - OUT_OF_ORDER_PENALTY)
  return cappedTier * TIER_GAP + fine
}

export function scoreItem(query: string, fields: SearchFields): number {
  const q = query.trim()
  if (q.length === 0) return -1
  let best = scoreField(q, fields.name, FIELD_PENALTY.name)
  if (fields.exe) best = Math.max(best, scoreField(q, fields.exe, FIELD_PENALTY.exe))
  if (fields.acronym && q.length >= 2) {
    best = Math.max(best, scoreField(q, fields.acronym, FIELD_PENALTY.acronym))
  }
  if (q.length >= 3) {
    for (const fusion of fields.fusions) best = Math.max(best, scoreField(q, fusion, FIELD_PENALTY.fusion))
  }
  for (const alias of fields.aliases) best = Math.max(best, scoreAlias(q, alias))
  best = Math.max(best, scoreWordsInAnyOrder(q, fields))
  if (best < 0) best = scoreTypo(q, fields)
  return best
}

export function frecencyKey(target: string): string {
  if (!target) return ""
  return target.trim().replace(/^["']+|["']+$/g, "").trim().toLowerCase()
}

export function frecencyBoost(frecency: number): number {
  if (!(frecency > 0)) return 0
  const ratio = Math.log10(1 + frecency) / Math.log10(1 + FRECENCY_REFERENCE)
  return Math.min(FRECENCY_CAP, Math.round(FRECENCY_CAP * ratio))
}
