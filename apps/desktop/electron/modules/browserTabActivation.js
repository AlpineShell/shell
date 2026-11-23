function parseTabTarget(tab) {
  const hwnd = Math.trunc(Number(tab?.hwnd))
  const index = Math.trunc(Number(tab?.index))
  const title = typeof tab?.title === 'string' ? tab.title : ''
  if (!Number.isFinite(hwnd) || !Number.isFinite(index) || !title) return null
  return { hwnd, index, title }
}

async function activateBrowserTab(tab, { selectTab, activateWindow, ensureWindowFocused, onError = () => {} }) {
  const target = parseTabTarget(tab)
  if (!target) return { ok: false }
  const token = activateWindow(target.hwnd)
  try {
    const ok = await selectTab(target.hwnd, target.index, target.title)
    if (ok) ensureWindowFocused(target.hwnd, token)
    return { ok }
  } catch (e) {
    onError(e)
    return { ok: false }
  }
}

module.exports = { parseTabTarget, activateBrowserTab }
