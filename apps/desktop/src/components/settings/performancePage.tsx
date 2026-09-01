import { useEffect, useMemo, useState } from 'react'
import { Pin, PinOff } from 'lucide-react'
import { useProcessGovernor } from '../../hooks/useProcessGovernor'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import Button from '../ui/button'
import IconButton from '../ui/iconButton'

const STATE_ORDER: Record<GovernedProcessState, number> = {
  napping: 0,
  occluded: 1,
  visible: 2,
  interactive: 3,
}

const STATE_LABELS: Record<GovernedProcessState, string> = {
  napping: 'Napping',
  occluded: 'Covered',
  visible: 'On screen',
  interactive: 'Interactive',
}

const STATE_CHIP_CLASSES: Record<GovernedProcessState, string> = {
  napping: 'bg-success/15 text-success',
  occluded: 'bg-warning/15 text-warning',
  visible: 'bg-fill-ghost text-ink-secondary',
  interactive: 'bg-fill-ghost text-ink-quiet',
}

function processLabel(governed: GovernedProcess): string {
  return governed.name ?? `PID ${governed.pid}`
}

function compareGovernedProcesses(a: GovernedProcess, b: GovernedProcess): number {
  const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state]
  if (byState !== 0) return byState
  return processLabel(a).localeCompare(processLabel(b))
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function activitySubtitle(enabled: boolean, governedCount: number): string {
  if (!enabled) return 'Napping is off, so nothing here is being eased off. This is what Alpine would work with.'
  if (governedCount === 0) return 'Nothing is being eased off right now.'
  return `Easing off ${governedCount} ${governedCount === 1 ? 'app' : 'apps'} right now.`
}

export default function PerformancePage() {
  const { config, setConfig, pin, revertAll, capabilities, processes, governedCount } = useProcessGovernor()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const sorted = useMemo(() => [...processes].sort(compareGovernedProcesses), [processes])
  const pinnedPaths = useMemo(() => new Set(config.pinnedPaths), [config.pinnedPaths])

  const memoryPriorityAvailable = capabilities.memoryPriority
  const deepNapAvailable = capabilities.cpuSets || capabilities.ioPriority

  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle
        title="Performance"
        subtitle="Give the app you are using more of this PC by easing off the ones you are not."
      />

      <Section title="Napping">
        <Row
          label="Ease off apps you are not using"
          description="Off by default. Alpine quiets apps whose windows are completely covered or put away, and wakes them the instant you switch back."
        >
          <Toggle
            label="Ease off apps you are not using"
            checked={config.enabled}
            onChange={(enabled) => setConfig({ enabled })}
          />
        </Row>
      </Section>

      <Section title="How far to go" subtitle="These only apply while napping is on.">
        <div className="flex flex-col gap-3">
          <Row
            label="Also lower memory priority"
            description="For covered apps, and only while this PC is short on memory, so Windows reclaims their pages before those of the app you are using."
            disabled={!config.enabled || !memoryPriorityAvailable}
          >
            <Toggle
              label="Also lower memory priority"
              checked={config.lowerMemoryPriority}
              disabled={!config.enabled || !memoryPriorityAvailable}
              onChange={(lowerMemoryPriority) => setConfig({ lowerMemoryPriority })}
            />
          </Row>
          <Row
            label="Deep nap"
            description="For apps that have been put away a while: move them to the efficiency cores and drop their CPU and disk priority."
            disabled={!config.enabled || !deepNapAvailable}
          >
            <Toggle
              label="Deep nap"
              checked={config.deepNap}
              disabled={!config.enabled || !deepNapAvailable}
              onChange={(deepNap) => setConfig({ deepNap })}
            />
          </Row>
          {!config.enabled && (
            <p className="text-xs text-ink-quiet">
              These do nothing on their own — turn napping on above first.
            </p>
          )}
          {config.enabled && !memoryPriorityAvailable && (
            <p className="text-xs text-ink-quiet">
              This version of Windows does not let Alpine set memory priority, so covered apps keep theirs.
            </p>
          )}
          {config.enabled && !deepNapAvailable && (
            <p className="text-xs text-ink-quiet">
              This machine has one kind of CPU core, so core steering has nothing to steer to.
            </p>
          )}
        </div>
      </Section>

      <Section title="Start over">
        <Row
          label="Restore every app"
          description="Put every app Alpine has eased off back exactly the way Windows had it."
        >
          <Button variant="outline" size="sm" onClick={revertAll}>
            Restore every app now
          </Button>
        </Row>
      </Section>

      <Section title="Activity" subtitle={activitySubtitle(config.enabled, governedCount)}>
        {sorted.length === 0 ? (
          <p className="text-sm text-ink-quiet">No app windows are open, so there is nothing to ease off yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {sorted.map((governed) => (
              <ActivityRow
                key={governed.pid}
                governed={governed}
                now={now}
                pinned={governed.path !== null && pinnedPaths.has(governed.path)}
                onTogglePin={pin}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function ActivityRow({
  governed,
  now,
  pinned,
  onTogglePin,
}: {
  governed: GovernedProcess
  now: number
  pinned: boolean
  onTogglePin: (imagePath: string, pinned: boolean) => void
}) {
  const label = processLabel(governed)
  const path = governed.path

  return (
    <div
      className={`flex min-h-14 items-center gap-3 rounded-card border border-line-hairline bg-surface-2 px-3 py-2 ${
        governed.excluded ? 'opacity-60' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-dense text-ink-primary">{label}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-eyebrow uppercase ${STATE_CHIP_CLASSES[governed.state]}`}>
            {STATE_LABELS[governed.state]}
          </span>
        </div>
        <span className="truncate text-xs text-ink-quiet">
          {governed.explanation} · for {formatElapsed(now - governed.since)}
        </span>
      </div>
      <IconButton
        label={pinned ? `Let Alpine ease off ${label}` : `Always leave ${label} alone`}
        disabled={path === null}
        onClick={() => { if (path) onTogglePin(path, !pinned) }}
      >
        {pinned ? <PinOff size={15} /> : <Pin size={15} />}
      </IconButton>
    </div>
  )
}
