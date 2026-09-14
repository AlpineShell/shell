import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronBinary from 'electron'
import { SETTINGS_PAGES } from '../src/settings/registry.ts'

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.join(projectRoot, '..', '..')
const outputDir = path.join(repoRoot, 'docs', 'screenshots', 'design-system')

const VITE_PORT = 5173
const DEBUG_PORT = 9222
const TILE_WIDTH = 1280
const TILE_HEIGHT = 820
const SHEET_WIDTH = 1680
const THEMES = ['light', 'dark']
const RIDGE_COLOR_FOR_THEME = {
  light: { r: 235, g: 235, b: 235 },
  dark: { r: 30, g: 30, b: 30 },
}

const ROUTED_PAGES = SETTINGS_PAGES.filter((page) => page.route !== null)

const SETTLE_MS = {
  home: 2500,
  wallpaper: 2500,
  displays: 2500,
  wifi: 4000,
  bluetooth: 3000,
  apps: 2000,
  'apps/installed': 6000,
  'apps/startup': 5000,
  'apps/running': 5000,
  'apps/defaults': 3000,
  plugins: 3000,
  updates: 3000,
}

function tilesFor(pages) {
  return pages.flatMap((page) => {
    if (page.id !== 'tiling') return [{ route: page.route, label: page.label }]
    return [
      { route: page.route, label: page.label, tiling: false },
      { route: page.route, label: `${page.label} (enabled)`, tiling: true },
    ]
  })
}

const TILES = tilesFor(ROUTED_PAGES)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(probe, { timeoutMs = 60000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error('timed out waiting for the app to come up')
    await sleep(intervalMs)
  }
}

async function respondsOnPort(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })
    return Boolean(response)
  } catch {
    return false
  }
}

async function listTargets() {
  try {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, { signal: AbortSignal.timeout(2000) })
    return await response.json()
  } catch {
    return []
  }
}

async function findTarget(mode) {
  const targets = await listTargets()
  return targets.find((target) => target.type === 'page' && target.url.includes(`mode=${mode}`)) ?? null
}

async function openDevtoolsSession(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await once(socket, 'open')
  const pending = new Map()
  let nextId = 1

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const waiting = pending.get(message.id)
    if (!waiting) return
    pending.delete(message.id)
    if (message.error) waiting.reject(new Error(`${message.error.message} (${JSON.stringify(message.error.data ?? null)})`))
    else waiting.resolve(message.result)
  })

  function send(method, params = {}) {
    const id = nextId++
    socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
    return result.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')

  return { send, evaluate, close: () => socket.close() }
}

async function captureViewport(session, width, height) {
  const result = await session.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  })
  return result.data
}

function startVite() {
  const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  return spawn(process.execPath, [viteBin, '--port', String(VITE_PORT), '--strictPort'], {
    cwd: projectRoot,
    stdio: 'ignore',
  })
}

function startElectron() {
  return spawn(electronBinary, ['.', `--remote-debugging-port=${DEBUG_PORT}`], {
    cwd: projectRoot,
    stdio: 'ignore',
  })
}

function killTree(child) {
  if (!child?.pid) return
  try {
    spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true })
  } catch {}
}

async function navigate(shell, route) {
  await shell.evaluate(`window.shell.windows.openSettings(${JSON.stringify(route)})`)
}

async function setTiling(shell, enabled) {
  await shell.evaluate(`window.shell.tiling.setConfig({ enabled: ${enabled} })`)
}

async function paintRidge(shell, colorOverride) {
  await shell.evaluate(`window.topbar.setColorOverride(${JSON.stringify(colorOverride)})`)
}

function tileMarkup(tiles) {
  return tiles
    .map((tile, index) => {
      const source = 'data:image/png;base64,${SHEET_TILES[' + index + ']}'
      return `<figure class="sheet-tile"><img src="${source}" /><figcaption>${tile.label}</figcaption></figure>`
    })
    .join('')
}

async function composeSheet(settings, theme, tiles) {
  await settings.send('Emulation.setDeviceMetricsOverride', {
    width: SHEET_WIDTH,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })

  await settings.evaluate('window.SHEET_TILES = []; true')
  for (const tile of tiles) {
    await settings.evaluate(`window.SHEET_TILES.push(${JSON.stringify(tile.image)}); true`)
  }

  const cells = tileMarkup(tiles)
  const title = `Alpine Shell Settings — ${theme} mode`
  const subtitle = `All ${ROUTED_PAGES.length} settings routes, rendered from the settings registry`

  const height = await settings.evaluate(`(async () => {
    document.documentElement.dataset.theme = ${JSON.stringify(theme)}
    document.documentElement.style.colorScheme = ${JSON.stringify(theme)}
    document.documentElement.style.height = 'auto'
    document.documentElement.style.overflow = 'visible'
    document.body.replaceChildren()
    document.body.removeAttribute('class')
    document.body.style.cssText = 'margin:0;height:auto;overflow:visible;padding:34px 31px 40px 34px;background:var(--alpine-surface-0);font-family:Geist,system-ui,sans-serif;'

    const style = document.createElement('style')
    style.textContent = \`
      .sheet-head { margin: 0 0 26px 0; }
      .sheet-head h1 { margin: 0; font-size: 27px; font-weight: 700; letter-spacing: -0.01em; color: var(--alpine-ink-primary); }
      .sheet-head p { margin: 8px 0 0 0; font-size: 15px; color: var(--alpine-ink-quiet); }
      .sheet-grid { display: grid; grid-template-columns: repeat(3, 521px); gap: 34px 26px; }
      .sheet-tile { margin: 0; }
      .sheet-tile img { display: block; width: 521px; height: 334px; border: 1px solid var(--alpine-line-hairline); border-radius: 2px; }
      .sheet-tile figcaption { margin-top: 12px; font-size: 15px; color: var(--alpine-ink-primary); }
    \`
    document.body.appendChild(style)

    const head = document.createElement('header')
    head.className = 'sheet-head'
    head.innerHTML = '<h1>' + ${JSON.stringify(title)} + '</h1><p>' + ${JSON.stringify(subtitle)} + '</p>'
    document.body.appendChild(head)

    const grid = document.createElement('div')
    grid.className = 'sheet-grid'
    grid.innerHTML = \`${cells}\`
    document.body.appendChild(grid)

    await Promise.all([...document.images].map((image) => image.decode()))
    await document.fonts.ready
    return Math.ceil(document.body.getBoundingClientRect().height)
  })()`)

  await settings.send('Emulation.setDeviceMetricsOverride', {
    width: SHEET_WIDTH,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await sleep(300)
  const data = await captureViewport(settings, SHEET_WIDTH, height)
  await settings.send('Emulation.clearDeviceMetricsOverride')
  return data
}

async function main() {
  const started = { vite: null, electron: null }
  const restore = { ridgeColorOverride: undefined, tiling: null }
  let shell = null
  let settings = null

  try {
    if (!(await respondsOnPort(VITE_PORT))) {
      started.vite = startVite()
      await waitFor(() => respondsOnPort(VITE_PORT))
    }

    started.electron = startElectron()
    const desktopTarget = await waitFor(() => findTarget('desktop'))
    shell = await openDevtoolsSession(desktopTarget)

    restore.ridgeColorOverride = await shell.evaluate('window.topbar.colorOverride()')
    restore.tiling = await shell.evaluate('window.shell.tiling.config().then((value) => value.enabled)')

    await navigate(shell, 'home')
    const settingsTarget = await waitFor(() => findTarget('settings'))
    settings = await openDevtoolsSession(settingsTarget)
    await sleep(2000)

    const captured = new Map()

    for (const theme of THEMES) {
      await paintRidge(shell, RIDGE_COLOR_FOR_THEME[theme])
      await sleep(800)
      await settings.send('Emulation.setDeviceMetricsOverride', {
        width: TILE_WIDTH,
        height: TILE_HEIGHT,
        deviceScaleFactor: 1,
        mobile: false,
      })

      const tiles = []
      for (const tile of TILES) {
        if (typeof tile.tiling === 'boolean') await setTiling(shell, tile.tiling)
        await navigate(shell, tile.route)
        await sleep(SETTLE_MS[tile.route] ?? 1200)
        tiles.push({ label: tile.label, image: await captureViewport(settings, TILE_WIDTH, TILE_HEIGHT) })
        process.stdout.write(`captured ${theme} — ${tile.label}\n`)
      }

      await settings.send('Emulation.clearDeviceMetricsOverride')
      captured.set(theme, tiles)
    }

    if (typeof restore.tiling === 'boolean') await setTiling(shell, restore.tiling)

    await mkdir(outputDir, { recursive: true })
    for (const theme of THEMES) {
      const data = await composeSheet(settings, theme, captured.get(theme))
      const file = path.join(outputDir, `settings-${theme}.png`)
      await writeFile(file, Buffer.from(data, 'base64'))
      process.stdout.write(`wrote ${file}\n`)
    }

    if (restore.ridgeColorOverride !== undefined) await paintRidge(shell, restore.ridgeColorOverride)
  } finally {
    settings?.close()
    shell?.close()
    killTree(started.electron)
    killTree(started.vite)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
