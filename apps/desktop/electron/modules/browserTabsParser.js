const CHROME_TAB_ANNOTATION = /(?: - (?:High memory usage|Memory usage) - [\d.,]+\s?[KMG]B| - (?:Audio playing|Audio muted))+$/

function cleanTabTitle(title) {
  return title.replace(CHROME_TAB_ANNOTATION, '').trim()
}

function toBrowserTab({ hwnd, browser, index, selected, title }) {
  const cleanTitle = typeof title === 'string' ? cleanTabTitle(title) : ''
  if (!Number.isFinite(hwnd) || !Number.isFinite(index) || !cleanTitle) return null
  return { hwnd, browser, index, selected, title: cleanTitle }
}

function parseTabs(raw) {
  if (!raw) return []
  const tabs = []
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts.length < 5) continue
    const tab = toBrowserTab({
      hwnd: Number(parts[0]),
      browser: parts[1],
      index: Number(parts[2]),
      selected: parts[3] === '1',
      title: parts.slice(4).join('\t'),
    })
    if (tab) tabs.push(tab)
  }
  return tabs
}

module.exports = { cleanTabTitle, parseTabs, toBrowserTab }
