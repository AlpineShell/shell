import { EMOJIS, type EmojiEntry } from "./emojiData"

const DETECT_CELL = 18
const DETECT_COLS = 64
const TOFU_REFERENCE = "\u{10FFFF}"

let cache: EmojiEntry[] | null = null

function regionAt(data: Uint8ClampedArray, canvasWidth: number, index: number): Uint8ClampedArray {
  const col = index % DETECT_COLS
  const row = Math.floor(index / DETECT_COLS)
  const x0 = col * DETECT_CELL
  const y0 = row * DETECT_CELL
  const out = new Uint8ClampedArray(DETECT_CELL * DETECT_CELL * 4)
  let p = 0
  for (let y = 0; y < DETECT_CELL; y++) {
    let src = ((y0 + y) * canvasWidth + x0) * 4
    for (let b = 0; b < DETECT_CELL * 4; b++) out[p++] = data[src++]
  }
  return out
}

function isBlank(region: Uint8ClampedArray): boolean {
  for (let i = 3; i < region.length; i += 4) if (region[i] !== 0) return false
  return true
}

function sameRegion(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function detectRenderable(): EmojiEntry[] {
  const rows = Math.ceil((EMOJIS.length + 1) / DETECT_COLS)
  const canvas = document.createElement("canvas")
  canvas.width = DETECT_COLS * DETECT_CELL
  canvas.height = rows * DETECT_CELL
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return EMOJIS

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `${DETECT_CELL - 4}px "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`

  const draw = (index: number, char: string) => {
    const cx = (index % DETECT_COLS) * DETECT_CELL + DETECT_CELL / 2
    const cy = Math.floor(index / DETECT_COLS) * DETECT_CELL + DETECT_CELL / 2
    ctx.fillText(char, cx, cy)
  }

  draw(0, TOFU_REFERENCE)
  for (let i = 0; i < EMOJIS.length; i++) draw(i + 1, EMOJIS[i].c)

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const tofu = regionAt(data, canvas.width, 0)

  const renderable: EmojiEntry[] = []
  for (let i = 0; i < EMOJIS.length; i++) {
    const region = regionAt(data, canvas.width, i + 1)
    if (isBlank(region)) continue
    if (sameRegion(region, tofu)) continue
    renderable.push(EMOJIS[i])
  }
  return renderable.length > 0 ? renderable : EMOJIS
}

export function getRenderableEmojis(): EmojiEntry[] {
  if (cache) return cache
  try {
    cache = detectRenderable()
  } catch {
    cache = EMOJIS
  }
  return cache
}

export function warmRenderableEmojis(): () => void {
  if (cache) return () => {}
  const warm = () => { getRenderableEmojis() }
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(warm, { timeout: 3000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(warm, 500)
  return () => window.clearTimeout(handle)
}
