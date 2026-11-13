const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { describeWallpaperImage, isSafeToRescale } = require('./wallpaperImageHeader')

const HEADER_BYTES = 512 * 1024
const MIN_PIXEL_RATIO_TO_RESCALE = 1.25
const JPEG_QUALITY = 95
const GENERATION_QUIET_MS = 10000
const MAX_REMEMBERED_PLANS = 32
const SCALED_COPY_VERSION = 1
const SCALED_COPY_DIRECTORY = 'wallpaper-scaled'
const DISPLAY_EVENTS = ['display-added', 'display-removed', 'display-metrics-changed']

function physicalDisplayArea(display) {
  return {
    width: Math.ceil((display.size.width + 1) * display.scaleFactor),
    height: Math.ceil((display.size.height + 1) * display.scaleFactor),
  }
}

function coverScale(image, area) {
  return Math.max(area.width / image.width, area.height / image.height)
}

function requiredScale(image, areas) {
  return Math.max(...areas.map((area) => coverScale(image, area)))
}

function scaledWallpaperSize(image, areas) {
  if (areas.length === 0) return null
  const scale = requiredScale(image, areas)
  if (!(scale < 1)) return null
  const target = {
    width: Math.min(image.width, Math.ceil(image.width * scale)),
    height: Math.min(image.height, Math.ceil(image.height * scale)),
  }
  if (image.width * image.height < MIN_PIXEL_RATIO_TO_RESCALE * target.width * target.height) return null
  return target
}

function copyCovers(copy, areas) {
  const scale = requiredScale(copy.image, areas)
  return copy.target.width >= copy.image.width * scale && copy.target.height >= copy.image.height * scale
}

function scaledCopyFormat(facts) {
  return facts.format === 'png' && facts.hasAlpha ? 'png' : 'jpeg'
}

function scaledCopyName({ sourcePath, mtimeMs, sizeBytes, target, format }) {
  const identity = JSON.stringify({ version: SCALED_COPY_VERSION, sourcePath, mtimeMs, sizeBytes, target, format })
  const digest = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32)
  return `${digest}.${format === 'png' ? 'png' : 'jpg'}`
}

function areasKey(areas) {
  return areas.map((area) => `${area.width}x${area.height}`).sort().join(',')
}

function planScaledCopy({ sourcePath, stat, facts, areas, cacheDirectory }) {
  if (!isSafeToRescale(facts)) return null
  const image = { width: facts.width, height: facts.height }
  const target = scaledWallpaperSize(image, areas)
  if (!target) return null
  const format = scaledCopyFormat(facts)
  const name = scaledCopyName({ sourcePath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size, target, format })
  return { sourcePath, image, target, format, cachedPath: path.join(cacheDirectory, name) }
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function encodeWithNativeImage(plan) {
  const { nativeImage } = require('electron')
  const source = await fs.promises.readFile(plan.sourcePath)
  await nextTurn()
  const image = nativeImage.createFromBuffer(source)
  const size = image.getSize()
  if (image.isEmpty() || size.width !== plan.image.width || size.height !== plan.image.height) return null
  await nextTurn()
  const scaled = image.resize({ width: plan.target.width, height: plan.target.height, quality: 'best' })
  await nextTurn()
  return plan.format === 'png' ? scaled.toPNG() : scaled.toJPEG(JPEG_QUALITY)
}

async function readHeader(filePath) {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}

function createWallpaperScaler({
  cacheDirectory,
  readDisplayAreas,
  onServedCopyOutgrown = () => {},
  encodeScaledCopy = encodeWithNativeImage,
  quietDelayMs = GENERATION_QUIET_MS,
}) {
  const plans = new Map()
  const servedCopies = new Map()
  let lastServedSource = null
  let lastHandledAreasKey = null
  let pendingPlan = null
  let generationTimer = null
  let generating = false

  async function planFor(sourcePath) {
    const stat = await fs.promises.stat(sourcePath)
    const areas = readDisplayAreas()
    const planKey = `${sourcePath}|${stat.mtimeMs}|${stat.size}|${areasKey(areas)}`
    if (plans.has(planKey)) return plans.get(planKey)
    const facts = describeWallpaperImage(await readHeader(sourcePath))
    const plan = planScaledCopy({ sourcePath, stat, facts, areas, cacheDirectory })
    if (plans.size >= MAX_REMEMBERED_PLANS) plans.clear()
    plans.set(planKey, plan)
    return plan
  }

  async function removeOtherCopies(keptPath) {
    const names = await fs.promises.readdir(cacheDirectory).catch(() => [])
    for (const name of names) {
      const candidate = path.join(cacheDirectory, name)
      if (candidate !== keptPath) await fs.promises.unlink(candidate).catch(() => {})
    }
  }

  async function writeScaledCopy(plan, encoded) {
    await fs.promises.mkdir(cacheDirectory, { recursive: true })
    const partialPath = `${plan.cachedPath}.partial`
    await fs.promises.writeFile(partialPath, encoded)
    await fs.promises.rename(partialPath, plan.cachedPath)
  }

  async function generate(plan) {
    if (await fileExists(plan.cachedPath)) return
    const encoded = await encodeScaledCopy(plan)
    if (!encoded || encoded.length === 0) return
    await writeScaledCopy(plan, encoded)
    await removeOtherCopies(plan.cachedPath)
  }

  function scheduleGeneration(plan) {
    pendingPlan = plan
    clearTimeout(generationTimer)
    generationTimer = setTimeout(runPendingGeneration, quietDelayMs)
    generationTimer.unref?.()
  }

  async function runPendingGeneration() {
    generationTimer = null
    const plan = pendingPlan
    if (!plan) return
    if (generating) {
      scheduleGeneration(plan)
      return
    }
    pendingPlan = null
    generating = true
    try {
      await generate(plan)
    } catch (e) {
      console.error('[wallpaperScaling] could not write a scaled copy:', e?.message ?? e)
    } finally {
      generating = false
    }
  }

  function forgetCopiesOfOtherSources(sourcePath) {
    for (const [cachedPath, copy] of servedCopies) {
      if (copy.sourcePath !== sourcePath) servedCopies.delete(cachedPath)
    }
  }

  async function servedFileFor(sourcePath) {
    try {
      lastServedSource = sourcePath
      forgetCopiesOfOtherSources(sourcePath)
      const plan = await planFor(sourcePath)
      if (!plan) return sourcePath
      if (!(await fileExists(plan.cachedPath))) {
        scheduleGeneration(plan)
        return sourcePath
      }
      servedCopies.set(plan.cachedPath, plan)
      return plan.cachedPath
    } catch (e) {
      console.error('[wallpaperScaling] serving the original wallpaper:', e?.message ?? e)
      return sourcePath
    }
  }

  function prepareCopyForCurrentDisplays() {
    if (!lastServedSource) return
    planFor(lastServedSource)
      .then((plan) => plan && scheduleGeneration(plan))
      .catch(() => {})
  }

  function handleDisplaysChanged() {
    const areas = readDisplayAreas()
    const currentAreasKey = areasKey(areas)
    if (currentAreasKey === lastHandledAreasKey) return
    lastHandledAreasKey = currentAreasKey
    if ([...servedCopies.values()].some((copy) => !copyCovers(copy, areas))) {
      servedCopies.clear()
      onServedCopyOutgrown()
    }
    prepareCopyForCurrentDisplays()
  }

  function stop() {
    clearTimeout(generationTimer)
    generationTimer = null
    pendingPlan = null
  }

  return { servedFileFor, handleDisplaysChanged, stop }
}

function startWallpaperScaling({ onServedCopyOutgrown }) {
  const { app, screen } = require('electron')
  const scaler = createWallpaperScaler({
    cacheDirectory: path.join(app.getPath('userData'), SCALED_COPY_DIRECTORY),
    readDisplayAreas: () => screen.getAllDisplays().map(physicalDisplayArea),
    onServedCopyOutgrown,
  })
  for (const event of DISPLAY_EVENTS) screen.on(event, scaler.handleDisplaysChanged)
  app.on('will-quit', scaler.stop)
  return scaler
}

module.exports = {
  GENERATION_QUIET_MS,
  JPEG_QUALITY,
  MIN_PIXEL_RATIO_TO_RESCALE,
  copyCovers,
  createWallpaperScaler,
  physicalDisplayArea,
  planScaledCopy,
  scaledCopyName,
  scaledWallpaperSize,
  startWallpaperScaling,
}
