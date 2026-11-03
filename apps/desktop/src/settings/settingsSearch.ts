import { FlaskConical } from 'lucide-react'
import {
  SETTINGS_PAGES,
  SETTINGS_PAGE_GROUP,
  SETTINGS_REGISTRY,
  isSettingsValueEntry,
  settingsSectionLabel,
} from './registry'
import { scoreField } from '../lib/launcherSearch'

export const SETTINGS_SEARCH_LIMIT = 12

const PREVIEW_BUILDS_TARGET: SettingsSearchTarget = {
  id: 'preview-builds',
  label: 'Preview builds',
  description: 'Enable early access to Alpine Shell updates',
  keywords: ['preview', 'preview builds', 'early access', 'beta', 'nightly', 'update channel'],
  icon: FlaskConical,
  context: 'Updates',
  action: { kind: 'update-channel', channel: 'nightly' },
}

const KEYWORD_PENALTY = 4
const DESCRIPTION_PENALTY = 8
const DROPPED_WORD_PENALTY = 1

function entryAction(entry: SettingsEntry, page: SettingsPage): SettingsSearchAction {
  if (isSettingsValueEntry(entry) && entry.control.kind === 'toggle' && entry.applies === 'instant') {
    return { kind: 'toggle', entry }
  }
  if (page.route !== null) return { kind: 'navigate', route: page.route, highlight: entry.id }
  if (entry.control.kind === 'action') return { kind: 'run', run: entry.control.run, actionIcon: entry.control.actionIcon }
  return { kind: 'launcher' }
}

function pageTarget(page: SettingsPage, route: string): SettingsSearchTarget {
  return {
    id: `page:${page.id}`,
    label: page.label,
    description: page.description,
    keywords: page.keywords,
    icon: page.icon,
    context: settingsSectionLabel(page.section),
    action: { kind: 'navigate', route, highlight: null },
  }
}

function entryTarget(entry: SettingsEntry, page: SettingsPage): SettingsSearchTarget {
  return {
    id: entry.id,
    label: entry.label,
    description: entry.description,
    keywords: entry.keywords,
    icon: entry.icon,
    context: page.label,
    action: entryAction(entry, page),
  }
}

export function settingsSearchTargets(
  entries: SettingsEntry[] = SETTINGS_REGISTRY,
  pages: SettingsPage[] = SETTINGS_PAGES
): SettingsSearchTarget[] {
  const pagesById = new Map(pages.map((page) => [page.id, page]))
  const targets: SettingsSearchTarget[] = []
  const taken = new Set<string>()

  function add(target: SettingsSearchTarget) {
    const place = target.action.kind === 'navigate' ? target.action.route : target.id
    const key = `${place}|${target.label.toLowerCase()}`
    if (taken.has(key)) return
    taken.add(key)
    targets.push(target)
  }

  for (const page of pages) {
    if (page.route !== null) add(pageTarget(page, page.route))
  }
  for (const entry of entries) {
    const page = pagesById.get(entry.page)
    if (!page || entry.group === SETTINGS_PAGE_GROUP) continue
    add(entryTarget(entry, page))
  }
  add(PREVIEW_BUILDS_TARGET)
  return targets
}

export const SETTINGS_SEARCH_TARGETS = settingsSearchTargets()

function scorePhrase(query: string, phrase: string, penalty: number): number {
  const words = phrase.split(' ')
  let best = -1
  for (let from = 0; from < words.length; from++) {
    for (let to = words.length; to > from; to--) {
      const dropped = from + words.length - to
      const run = words.slice(from, to).join(' ')
      best = Math.max(best, scoreField(query, run, penalty + dropped * DROPPED_WORD_PENALTY))
    }
  }
  return best
}

export function scoreSettingsTarget(query: string, target: SettingsSearchTarget): number {
  let best = scorePhrase(query, target.label, 0)
  for (const keyword of target.keywords) best = Math.max(best, scorePhrase(query, keyword, KEYWORD_PENALTY))
  return Math.max(best, scoreField(query, target.description, DESCRIPTION_PENALTY))
}

export function searchSettings(
  query: string,
  targets: SettingsSearchTarget[] = SETTINGS_SEARCH_TARGETS
): SettingsSearchMatch[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []
  const matches: SettingsSearchMatch[] = []
  for (const target of targets) {
    const score = scoreSettingsTarget(trimmed, target)
    if (score >= 0) matches.push({ target, score })
  }
  return matches.sort((a, b) => b.score - a.score)
}
