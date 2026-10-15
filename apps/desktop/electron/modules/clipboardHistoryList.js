const MAX_ENTRIES = 25
const PREVIEW_TEXT_LENGTH = 2000

function hasSameContent(a, b) {
  return a.kind === b.kind && a.contentKey === b.contentKey
}

function addEntry(entries, entry, maxEntries = MAX_ENTRIES) {
  const withoutDuplicate = entries.filter((existing) => !hasSameContent(existing, entry))
  return [entry, ...withoutDuplicate].slice(0, maxEntries)
}

function removeEntry(entries, id) {
  return entries.filter((entry) => entry.id !== id)
}

function findEntry(entries, id) {
  return entries.find((entry) => entry.id === id) ?? null
}

function isWorthKeeping(text) {
  return typeof text === 'string' && text.trim().length > 0
}

function summarizeEntry(entry) {
  if (entry.kind === 'image') {
    return { id: entry.id, kind: 'image', copiedAt: entry.copiedAt, thumbnail: entry.thumbnail, width: entry.width, height: entry.height }
  }
  return { id: entry.id, kind: 'text', copiedAt: entry.copiedAt, text: entry.text.slice(0, PREVIEW_TEXT_LENGTH) }
}

function summarizeEntries(entries) {
  return entries.map(summarizeEntry)
}

module.exports = { MAX_ENTRIES, addEntry, removeEntry, findEntry, isWorthKeeping, summarizeEntries }
