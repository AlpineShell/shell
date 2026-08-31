import { useShellState } from './useShellState'

const EMPTY_SUMMARY: PerfProbeSummary = {
  sampledAt: 0,
  windowMs: 300000,
  foregroundSwitch: {
    count: 0,
    timedOutCount: 0,
    p50Ms: null,
    p95Ms: null,
    minMs: null,
    maxMs: null,
  },
  hardFaults: {
    count: 0,
    p50PerSecond: null,
    p95PerSecond: null,
    maxPerSecond: null,
    meanPerSecond: null,
  },
  memory: {
    count: 0,
    totalBytes: null,
    availableBytes: null,
    standbyBytes: null,
    minAvailableBytes: null,
    minStandbyBytes: null,
  },
  dwmFrames: {
    supported: false,
    refreshRateHz: null,
    framesLate: null,
    framesDropped: null,
  },
}

export function usePerfProbe() {
  const summary = useShellState<PerfProbeSummary>(
    EMPTY_SUMMARY,
    window.shell.perfProbe.summary,
    window.shell.perfProbe.onSummaryChanged
  )

  const reset = () => {
    window.shell.perfProbe.reset().catch(() => {})
  }

  return { summary, reset }
}
