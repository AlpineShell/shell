import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { RotateCw, Star, MonitorCheck } from 'lucide-react'
import { useDisplays } from '../../hooks/useDisplays'
import { useMonitors } from '../../hooks/useMonitors'
import { monitorForDisplay } from './displayBrightness'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import Button from '../ui/button'
import Slider from '../ui/slider'
import Flyout from '../ui/flyout'

const SNAP_SCREEN_PX = 16
const KEEP_CHANGES_SECONDS = 15

function sameLayout(a: DisplayInfo[], b: DisplayInfo[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((d) => [d.id, d]))
  return a.every((d) => {
    const other = byId.get(d.id)
    return !!other && other.x === d.x && other.y === d.y && other.orientation === d.orientation && other.primary === d.primary
  })
}

function toLayout(displays: DisplayInfo[]): DisplayLayoutEntry[] {
  return displays.map((d) => ({ id: d.id, x: d.x, y: d.y, orientation: d.orientation, primary: d.primary }))
}

function orientationLabel(orientation: DisplayOrientation): string {
  if (orientation === 90) return 'Portrait'
  if (orientation === 180) return 'Landscape (flipped)'
  if (orientation === 270) return 'Portrait (flipped)'
  return 'Landscape'
}

function applyErrorMessage(code: number | null): string {
  if (code === -2) return "This display doesn't support the requested configuration."
  if (code === -5) return 'The display configuration is invalid.'
  return 'Windows could not apply the display changes.'
}

function snapAxis(value: number, size: number, others: { start: number; extent: number }[], threshold: number): number {
  let best = value
  let bestDistance = threshold
  for (const other of others) {
    const candidates = [other.start, other.start + other.extent - size, other.start + other.extent, other.start - size]
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - value)
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
  }
  return best
}

export default function DisplaysPage() {
  const committed = useDisplays()
  const { monitors, setBrightness } = useMonitors()
  const [draft, setDraft] = useState<DisplayInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'editing' | 'confirming'>('editing')
  const [secondsLeft, setSecondsLeft] = useState(KEEP_CHANGES_SECONDS)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(committed)
    setSelectedId((prev) => (committed.some((d) => d.id === prev) ? prev : null))
  }, [committed])

  useEffect(() => {
    if (phase !== 'confirming') return
    let remaining = KEEP_CHANGES_SECONDS
    setSecondsLeft(remaining)
    const interval = setInterval(() => {
      remaining -= 1
      setSecondsLeft(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        window.shell.system.revertDisplayLayout()
        setPhase('editing')
      }
    }, 1000)
    return () => {
      clearInterval(interval)
      window.shell.system.keepDisplayLayout()
    }
  }, [phase])

  const closeFlyout = useCallback(() => setSelectedId(null), [])

  const dirty = !sameLayout(draft, committed)
  const selected = draft.find((d) => d.id === selectedId) ?? null
  const selectedMonitor = selected ? monitorForDisplay(monitors, selected, draft) : null

  function moveDisplay(id: string, x: number, y: number) {
    setDraft((prev) => prev.map((d) => (d.id === id ? { ...d, x, y } : d)))
  }

  function rotateSelected() {
    if (!selected) return
    const next = (((selected.orientation + 90) % 360) as DisplayOrientation)
    setDraft((prev) =>
      prev.map((d) => (d.id === selected.id ? { ...d, orientation: next, width: d.height, height: d.width } : d))
    )
  }

  function setPrimarySelected() {
    if (!selected) return
    setDraft((prev) => prev.map((d) => ({ ...d, primary: d.id === selected.id })))
  }

  async function apply() {
    setApplying(true)
    setError(null)
    const result = await window.shell.system.applyDisplayLayout(toLayout(draft))
    setApplying(false)
    if (result.ok) {
      setPhase('confirming')
    } else {
      setError(applyErrorMessage(result.code))
    }
  }

  function discard() {
    setDraft(committed)
    setError(null)
  }

  async function keep() {
    await window.shell.system.keepDisplayLayout()
    setPhase('editing')
  }

  async function revertNow() {
    await window.shell.system.revertDisplayLayout()
    setPhase('editing')
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <PageTitle title="Displays" />

      {committed.length === 0 ? (
        <p className="text-sm text-ink-quiet">No displays detected.</p>
      ) : (
        <>
          {phase === 'confirming' ? (
            <div className="flex items-center justify-between gap-4 rounded-card border border-line-hairline bg-surface-2 px-4 py-3">
              <span className="inline-flex items-center gap-2 text-dense text-ink-primary">
                <MonitorCheck size={16} className="text-success" />
                Keep these display changes? Reverting in {secondsLeft}s.
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={revertNow} className="font-medium">
                  Revert
                </Button>
                <Button size="sm" onClick={keep} className="font-medium">
                  Keep changes
                </Button>
              </div>
            </div>
          ) : (
            dirty && (
              <div className="flex items-center justify-between gap-4 rounded-card border border-line-hairline bg-surface-2 px-4 py-3">
                <span className="text-dense text-ink-primary">You have unsaved display changes.</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={discard} className="font-medium">
                    Discard
                  </Button>
                  <Button size="sm" onClick={apply} disabled={applying} className="font-medium">
                    {applying ? 'Applying…' : 'Apply'}
                  </Button>
                </div>
              </div>
            )
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <Section title="Arrangement" subtitle="Drag the displays to match your desk. Click one to configure it.">
            <DisplayCanvas displays={draft} selectedId={selectedId} onSelect={setSelectedId} onMove={moveDisplay} />
          </Section>
        </>
      )}

      <Flyout
        open={!!selected}
        title={selected?.name ?? ''}
        subtitle={
          selected
            ? `${selected.width} × ${selected.height}${selected.refreshRate ? ` · ${selected.refreshRate} Hz` : ''}`
            : undefined
        }
        onClose={closeFlyout}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <Row label="Orientation" description={orientationLabel(selected.orientation)}>
              <Button variant="outline" size="sm" onClick={rotateSelected} className="font-medium">
                <RotateCw size={14} />
                Rotate
              </Button>
            </Row>

            <Row label="Primary display">
              {selected.primary ? (
                <span className="inline-flex h-8 items-center gap-1.5 text-xs text-success">
                  <Star size={14} />
                  Primary
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={setPrimarySelected} className="font-medium">
                  Set
                </Button>
              )}
            </Row>

            <Row
              label="Brightness"
              description={
                selectedMonitor
                  ? selectedMonitor.brightnessWritable
                    ? undefined
                    : 'This display reports brightness but will not accept changes.'
                  : 'This display does not report brightness over DDC/CI.'
              }
              disabled={!selectedMonitor || !selectedMonitor.brightnessWritable}
            >
              {selectedMonitor && selectedMonitor.brightnessWritable && (
                <Slider
                  label="Brightness"
                  min={0}
                  max={100}
                  step={1}
                  value={selectedMonitor.brightness}
                  suffix="%"
                  onChange={(value) => setBrightness(selectedMonitor.id, value)}
                />
              )}
            </Row>
          </div>
        )}
      </Flyout>
    </div>
  )
}

function DisplayCanvas({
  displays,
  selectedId,
  onSelect,
  onMove,
}: {
  displays: DisplayInfo[]
  selectedId: string | null
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const PAD = 28
  const minX = Math.min(0, ...displays.map((d) => d.x))
  const minY = Math.min(0, ...displays.map((d) => d.y))
  const maxX = Math.max(1, ...displays.map((d) => d.x + d.width))
  const maxY = Math.max(1, ...displays.map((d) => d.y + d.height))
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const scale = size.w > 0 ? Math.min((size.w - PAD * 2) / spanX, (size.h - PAD * 2) / spanY) : 0
  const originX = (size.w - spanX * scale) / 2 - minX * scale
  const originY = (size.h - spanY * scale) / 2 - minY * scale

  function startDrag(e: MouseEvent, d: DisplayInfo) {
    e.preventDefault()
    onSelect(d.id)
    drag.current = { id: d.id, startClientX: e.clientX, startClientY: e.clientY, startX: d.x, startY: d.y }
  }

  function onMouseMove(e: MouseEvent) {
    const active = drag.current
    if (!active || scale === 0) return
    const moving = displays.find((d) => d.id === active.id)
    if (!moving) return
    let nextX = Math.round(active.startX + (e.clientX - active.startClientX) / scale)
    let nextY = Math.round(active.startY + (e.clientY - active.startClientY) / scale)
    const threshold = SNAP_SCREEN_PX / scale
    const others = displays.filter((d) => d.id !== active.id)
    nextX = snapAxis(nextX, moving.width, others.map((o) => ({ start: o.x, extent: o.width })), threshold)
    nextY = snapAxis(nextY, moving.height, others.map((o) => ({ start: o.y, extent: o.height })), threshold)
    onMove(active.id, nextX, nextY)
  }

  function endDrag() {
    drag.current = null
  }

  return (
    <div
      ref={canvasRef}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      className="relative h-64 w-full select-none overflow-hidden rounded-card border border-line-hairline bg-surface-2"
    >
      {scale > 0 &&
        displays.map((d, index) => {
          const active = d.id === selectedId
          return (
            <div
              key={d.id}
              onMouseDown={(e) => startDrag(e, d)}
              className={`absolute flex cursor-grab flex-col items-center justify-center rounded-md border-2 transition-colors active:cursor-grabbing ${
                active ? 'border-focus-ring bg-fill-ghost text-ink-primary' : 'border-line-strong bg-surface-3 text-ink-secondary hover:border-ink-faint'
              }`}
              style={{
                left: originX + d.x * scale,
                top: originY + d.y * scale,
                width: Math.max(d.width * scale, 24),
                height: Math.max(d.height * scale, 24),
              }}
            >
              <span className="text-xl leading-none font-semibold">{index + 1}</span>
              <span className="mt-1 max-w-full truncate px-1 text-[10px] opacity-70">{d.name}</span>
              {d.primary && <Star size={12} className="absolute top-1 right-1 fill-success text-success" />}
            </div>
          )
        })}
    </div>
  )
}
