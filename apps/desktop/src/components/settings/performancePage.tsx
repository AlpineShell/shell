import { useState } from 'react'
import { usePerfProbe } from '../../hooks/usePerfProbe'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import Button from '../ui/button'

const BYTES_PER_GIGABYTE = 1024 ** 3
const MILLISECONDS_PER_MINUTE = 60000
const COPIED_LABEL_DURATION_MS = 2000

function formatMilliseconds(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)} ms`
}

function formatPerSecond(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(2)} /s`
}

function formatGigabytes(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${(value / BYTES_PER_GIGABYTE).toFixed(1)} GB`
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return '—'
  return String(value)
}

function formatHertz(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value} Hz`
}

export default function PerformancePage() {
  const { summary, reset } = usePerfProbe()
  const [copied, setCopied] = useState(false)

  const windowMinutes = Math.round(summary.windowMs / MILLISECONDS_PER_MINUTE)

  function copyBaseline() {
    navigator.clipboard.writeText(JSON.stringify(summary, null, 2)).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_LABEL_DURATION_MS)
  }

  return (
    <div className="flex flex-col gap-section w-full">
      <div className="flex flex-col gap-1">
        <PageTitle title="Performance probe" />
        <p className="text-xs text-ink-quiet">
          Every number below covers a rolling {windowMinutes}-minute window; anything older than that is dropped.
        </p>
      </div>

      <Section title="Foreground switch latency">
        <div className="flex flex-col gap-3">
          <ReadoutRow label="p50" value={formatMilliseconds(summary.foregroundSwitch.p50Ms)} />
          <ReadoutRow label="p95" value={formatMilliseconds(summary.foregroundSwitch.p95Ms)} />
          <ReadoutRow label="Fastest" value={formatMilliseconds(summary.foregroundSwitch.minMs)} />
          <ReadoutRow label="Slowest" value={formatMilliseconds(summary.foregroundSwitch.maxMs)} />
          <ReadoutRow label="Samples" value={formatCount(summary.foregroundSwitch.count)} />
          <ReadoutRow label="Timed out" value={formatCount(summary.foregroundSwitch.timedOutCount)} />
        </div>
      </Section>

      <Section title="Hard faults">
        <div className="flex flex-col gap-3">
          <ReadoutRow label="p50" value={formatPerSecond(summary.hardFaults.p50PerSecond)} />
          <ReadoutRow label="p95" value={formatPerSecond(summary.hardFaults.p95PerSecond)} />
          <ReadoutRow label="Peak" value={formatPerSecond(summary.hardFaults.maxPerSecond)} />
          <ReadoutRow label="Mean" value={formatPerSecond(summary.hardFaults.meanPerSecond)} />
          <ReadoutRow label="Samples" value={formatCount(summary.hardFaults.count)} />
        </div>
      </Section>

      <Section title="Memory headroom">
        <div className="flex flex-col gap-3">
          <ReadoutRow label="Available" value={formatGigabytes(summary.memory.availableBytes)} />
          <ReadoutRow label="Lowest available" value={formatGigabytes(summary.memory.minAvailableBytes)} />
          <ReadoutRow label="Standby" value={formatGigabytes(summary.memory.standbyBytes)} />
          <ReadoutRow label="Lowest standby" value={formatGigabytes(summary.memory.minStandbyBytes)} />
          <ReadoutRow label="Total" value={formatGigabytes(summary.memory.totalBytes)} />
        </div>
      </Section>

      <Section title="DWM frames">
        {summary.dwmFrames.supported ? (
          <div className="flex flex-col gap-3">
            <ReadoutRow label="Late frames" value={formatCount(summary.dwmFrames.framesLate)} />
            <ReadoutRow label="Dropped frames" value={formatCount(summary.dwmFrames.framesDropped)} />
            <ReadoutRow label="Refresh rate" value={formatHertz(summary.dwmFrames.refreshRateHz)} />
          </div>
        ) : (
          <p className="text-xs text-ink-quiet">
            The composition timing counters could not be read on this machine.
          </p>
        )}
      </Section>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={copyBaseline} className="font-medium">
          {copied ? 'Copied' : 'Copy baseline'}
        </Button>
        <Button variant="outline" size="sm" onClick={reset} className="font-medium">
          Reset window
        </Button>
      </div>
    </div>
  )
}

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <Row label={label}>
      <span className="text-sm tabular-nums text-ink-secondary">{value}</span>
    </Row>
  )
}
