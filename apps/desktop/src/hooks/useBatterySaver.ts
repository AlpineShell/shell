import { useEffect, useRef, useState } from 'react'
import { useShellState } from './useShellState'

const DEFAULT_CONFIG: BatterySaverConfig = {
  automaticEnabled: true,
  thresholdPercent: 20,
  dimDisplays: true,
  brightnessReductionPercent: 30,
  reduceBackgroundPolling: true,
  throttleProcesses: false,
}

const DEFAULT_STATE: BatterySaverState = {
  active: false,
  reason: null,
  override: 'auto',
  percent: null,
  charging: false,
  onAcPower: false,
  hasBattery: false,
}

export function useBatterySaver() {
  const [config, setConfigState] = useState<BatterySaverConfig>(DEFAULT_CONFIG)
  const unacknowledgedWrites = useRef(0)

  const state = useShellState<BatterySaverState>(
    DEFAULT_STATE,
    window.shell.batterySaver.state,
    window.shell.batterySaver.onStateChanged
  )

  useEffect(() => {
    let alive = true
    const adopt = (incoming: BatterySaverConfig) => {
      if (alive && unacknowledgedWrites.current === 0) setConfigState(incoming)
    }
    window.shell.batterySaver.config().then(adopt).catch(() => {})
    const unsubscribe = window.shell.batterySaver.onConfigChanged(adopt)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const setConfig = (partial: Partial<BatterySaverConfig>) => {
    setConfigState((current) => ({ ...current, ...partial }))
    unacknowledgedWrites.current += 1
    window.shell.batterySaver
      .setConfig(partial)
      .catch(() => {})
      .finally(() => { unacknowledgedWrites.current -= 1 })
  }

  const setOverride = (override: BatterySaverOverride) => {
    window.shell.batterySaver.setOverride(override)
  }

  return { config, setConfig, state, setOverride }
}
