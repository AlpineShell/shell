import { useEffect, useRef, useState } from 'react'
import { useShellState } from './useShellState'

const DEFAULT_CONFIG: ProcessGovernorConfig = {
  enabled: false,
  deepNap: false,
  lowerMemoryPriority: false,
  interactiveGraceMs: 5000,
  occludedDwellMs: 20000,
  nappingDwellMs: 60000,
  audioHoldMs: 15000,
  busyIoBytesPerSec: 2 * 1024 * 1024,
  memoryPressurePercent: 75,
  pinnedPaths: [],
}

const DEFAULT_CAPABILITIES: ProcessGovernorCapabilities = {
  build: 0,
  ecoQos: false,
  powerThrottlingReadback: false,
  ignoreTimerResolution: false,
  memoryPriority: false,
  ioPriority: false,
  cpuSets: false,
  efficientCpuSetIds: [],
}

const DEFAULT_STATE: ProcessGovernorState = {
  config: DEFAULT_CONFIG,
  capabilities: DEFAULT_CAPABILITIES,
  processes: [],
  governedCount: 0,
}

function withPinnedPath(paths: string[], imagePath: string, pinned: boolean): string[] {
  const without = paths.filter((path) => path !== imagePath)
  return pinned ? [...without, imagePath] : without
}

export function useProcessGovernor() {
  const [config, setConfigState] = useState<ProcessGovernorConfig>(DEFAULT_CONFIG)
  const unacknowledgedWrites = useRef(0)

  const state = useShellState<ProcessGovernorState>(
    DEFAULT_STATE,
    window.shell.processGovernor.state,
    window.shell.processGovernor.onStateChanged
  )

  useEffect(() => {
    if (unacknowledgedWrites.current === 0) setConfigState(state.config)
  }, [state])

  const trackWrite = (write: Promise<ProcessGovernorState>) => {
    unacknowledgedWrites.current += 1
    write
      .then((settled) => {
        if (unacknowledgedWrites.current === 1) setConfigState(settled.config)
      })
      .catch(() => {})
      .finally(() => { unacknowledgedWrites.current -= 1 })
  }

  const setConfig = (partial: Partial<ProcessGovernorConfig>) => {
    setConfigState((current) => ({ ...current, ...partial }))
    trackWrite(window.shell.processGovernor.setConfig(partial))
  }

  const pin = (imagePath: string, pinned: boolean) => {
    setConfigState((current) => ({ ...current, pinnedPaths: withPinnedPath(current.pinnedPaths, imagePath, pinned) }))
    trackWrite(window.shell.processGovernor.pin(imagePath, pinned))
  }

  const revertAll = () => {
    trackWrite(window.shell.processGovernor.revertAll())
  }

  return {
    config,
    setConfig,
    pin,
    revertAll,
    capabilities: state.capabilities,
    processes: state.processes,
    governedCount: state.governedCount,
  }
}
