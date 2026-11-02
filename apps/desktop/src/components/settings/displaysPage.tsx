import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { RotateCw, Star, MonitorCheck, ScanEye } from 'lucide-react'
import { Button, Card, EmptyState, PageTitle, Row, Section, Slider } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
import { useDisplays } from '../../hooks/useDisplays'
import { useMonitors } from '../../hooks/useMonitors'
import { useHighlightedSetting } from '../../hooks/useHighlightedSetting'

const SNAP_SCREEN_PX = 16
const KEEP_CHANGES_SECONDS = 15

function pickDefaultId(displays: DisplayInfo[]): string | null {
  return displays.find((d) => d.primary)?.id ?? displays[0]?.id ?? null
}

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

function monitorStatusNote(monitor: MonitorInfo): string | undefined {
  return monitor.brightnessWritable ? undefined : 'Not responding'
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
  const [draft, setDraft] = useState<DisplayInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'editing' | 'confirming'>('editing')
  const [secondsLeft, setSecondsLeft] = useState(KEEP_CHANGES_SECONDS)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(committed)
    setSelectedId((prev) => (committed.some((d) => d.id === prev) ? prev : pickDefaultId(committed)))
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

  const dirty = !sameLayout(draft, committed)
  const selected = draft.find((d) => d.id === selectedId) ?? null

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
    setSelectedId(pickDefaultId(committed))
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
    <div className="flex w-full flex-col gap-section">
      <PageTitle variant="plain" title={settingsPage('displays')?.label ?? ''} />

      {committed.length === 0 ? (
        <EmptyState variant="plain" title="No displays detected" />
      ) : (
        <>
          {phase === 'confirming' ? (
            <ChangesBanner
              icon={<MonitorCheck size={16} className="text-success" />}
              message={`Keep these display changes? Reverting in ${secondsLeft}s.`}
            >
              <Button shape="square" variant="ghost" size="sm" onClick={revertNow}>
                Revert
              </Button>
              <Button shape="square" size="sm" onClick={keep}>
                Keep changes
              </Button>
            </ChangesBanner>
          ) : (
            dirty && (
              <ChangesBanner message="You have unsaved display changes.">
                <Button shape="square" variant="ghost" size="sm" onClick={discard}>
                  Discard
                </Button>
                <Button shape="square" size="sm" busy={applying} onClick={apply}>
                  Apply
                </Button>
              </ChangesBanner>
            )
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <Section variant="label" title="Arrangement">
            <div className="relative">
              <DisplayCanvas displays={draft} selectedId={selectedId} onSelect={setSelectedId} onMove={moveDisplay} />
              <Button
                shape="square"
                variant="outline"
                size="sm"
                icon={<ScanEye size={14} />}
                className="absolute top-2 right-2"
                onClick={() => window.shell.system.identifyDisplays()}
              >
                Identify
              </Button>
            </div>
          </Section>

          {selected && (
            <Section variant="label" title={selected.name}>
              <Card variant="group">
                <Row
                  label={`${selected.width} × ${selected.height}${selected.refreshRate ? ` · ${selected.refreshRate} Hz` : ''}`}
                  description={orientationLabel(selected.orientation)}
                >
                  <div className="flex items-center gap-2">
                    <Button shape="square" variant="soft" size="sm" icon={<RotateCw size={14} />} onClick={rotateSelected}>
                      Rotate
                    </Button>
                    {selected.primary ? (
                      <span className="inline-flex h-7 items-center gap-1.5 px-2 text-dense text-ink-secondary">
                        <Star size={14} className="fill-current" />
                        Primary
                      </span>
                    ) : (
                      <Button shape="square" variant="soft" size="sm" icon={<Star size={14} />} onClick={setPrimarySelected}>
                        Set as primary
                      </Button>
                    )}
                  </div>
                </Row>
              </Card>
            </Section>
          )}
        </>
      )}

      <BrightnessSection />
    </div>
  )
}

function ChangesBanner({ icon, message, children }: { icon?: ReactNode; message: string; children: ReactNode }) {
  return (
    <div role="status" className="flex items-center justify-between gap-4 rounded-card bg-fill-subtle py-2.5 pr-2.5 pl-4">
      <span className="inline-flex items-center gap-2 text-dense text-ink-primary">
        {icon}
        {message}
      </span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function BrightnessSection() {
  const { monitors, setBrightness } = useMonitors()
  const highlighted = useHighlightedSetting('brightness')
  const anchor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted) anchor.current?.scrollIntoView({ block: 'center' })
  }, [highlighted])

  return (
    <Section variant="label" title="Brightness">
      <div
        ref={anchor}
        className={`rounded-card transition-shadow duration-300 ${highlighted ? 'ring-1 ring-line-strong' : ''}`}
      >
        {monitors.length === 0 ? (
          <EmptyState variant="plain" title="No display here has a brightness control Alpine can drive" />
        ) : (
          <Card variant="group">
            {monitors.map((monitor) => (
              <Row key={monitor.id} label={monitor.name} description={monitorStatusNote(monitor)}>
                <Slider
                  variant="wide"
                  label={`${monitor.name} brightness`}
                  min={0}
                  max={100}
                  step={1}
                  value={monitor.brightness}
                  suffix="%"
                  onChange={(value) => setBrightness(monitor.id, value)}
                />
              </Row>
            ))}
          </Card>
        )}
      </div>
    </Section>
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
      className="relative h-60 w-full rounded-card bg-fill-ghost overflow-hidden select-none"
    >
      {scale > 0 &&
        displays.map((d, index) => {
          const active = d.id === selectedId
          return (
            <button
              type="button"
              key={d.id}
              aria-pressed={active}
              aria-label={`Display ${index + 1}, ${d.name}`}
              onMouseDown={(e) => startDrag(e, d)}
              onClick={() => onSelect(d.id)}
              className={`focus-ring absolute flex flex-col items-center justify-center rounded-md border-2 transition-colors cursor-grab active:cursor-grabbing ${
                active ? 'border-ink-primary bg-fill-subtle text-ink-primary' : 'border-line-strong bg-surface-3 text-ink-secondary hover:border-ink-faint'
              }`}
              style={{
                left: originX + d.x * scale,
                top: originY + d.y * scale,
                width: Math.max(d.width * scale, 24),
                height: Math.max(d.height * scale, 24),
              }}
            >
              <span className="text-xl font-semibold leading-none">{index + 1}</span>
              <span className="mt-1 text-[10px] opacity-70 truncate max-w-full px-1">{d.name}</span>
              {d.primary && <Star size={12} className="absolute top-1.5 right-1.5 fill-current" />}
            </button>
          )
        })}
    </div>
  )
}
