const CHROME_TAB_ANNOTATION = /(?: - (?:High memory usage|Memory usage) - [\d.,]+\s?[KMG]B| - (?:Audio playing|Audio muted))+$/

function cleanTabTitle(title) {
  return title.replace(CHROME_TAB_ANNOTATION, '').trim()
}

function parseTabs(raw) {
  if (!raw) return []
  const tabs = []
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts.length < 5) continue
    const hwnd = Number(parts[0])
    const index = Number(parts[2])
    const title = cleanTabTitle(parts.slice(4).join('\t'))
    if (!Number.isFinite(hwnd) || !Number.isFinite(index) || !title) continue
    tabs.push({ hwnd, browser: parts[1], index, selected: parts[3] === '1', title })
  }
  return tabs
}

module.exports = { cleanTabTitle, parseTabs }
