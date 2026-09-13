import { useMemo } from 'react'
import { composeTray } from '../components/topbar/tray/composeTray'
import { useBattery } from './useBattery'
import { useBluetooth } from './useBluetooth'
import { useClockPrefs } from './useClockPrefs'
import { useMediaSession } from './useMediaSession'
import { useMediaVisualizer } from './useMediaVisualizer'
import { useMicrophone } from './useMicrophone'
import { useMinuteTick } from './useMinuteTick'
import { useNetworkStatus } from './useNetwork'
import { useRidgePluginWidgets } from './useRidgePluginWidgets'
import { useTopbarColor } from './useTopbarColor'
import { useTrayIcons } from './useTrayIcons'
import { useTrayLayout } from './useTrayLayout'
import { useTraySettings } from './useTraySettings'

function useMediaPlayback(): MediaPlayback {
  const { title, artist, appName, appIcon, playing, thumbnail, thumbnailType } = useMediaSession()
  return useMemo(
    () => ({ title, artist, appName, appIcon, playing, thumbnail, thumbnailType }),
    [title, artist, appName, appIcon, playing, thumbnail, thumbnailType]
  )
}

function useTrayPreview(): RidgeTrayPreviewData {
  const icons = useTrayIcons()
  const { layout } = useTrayLayout()
  const { settings } = useTraySettings()
  return useMemo(
    () => ({ ...composeTray(icons, layout), showOverflow: settings.showOverflow }),
    [icons, layout, settings.showOverflow]
  )
}

export function useRidgePreviewData(): RidgePreviewData {
  const color = useTopbarColor()
  const now = useMinuteTick()
  const { prefs } = useClockPrefs()
  const battery = useBattery()
  const { state: bluetooth } = useBluetooth()
  const network = useNetworkStatus()
  const playback = useMediaPlayback()
  const showVisualizer = useMediaVisualizer()
  const microphone = useMicrophone()
  const tray = useTrayPreview()
  const plugins = useRidgePluginWidgets()
  return useMemo(
    () => ({
      color,
      clock: { now, prefs },
      status: { battery, bluetooth, network },
      media: { playback, showVisualizer },
      microphone,
      tray,
      plugins,
    }),
    [color, now, prefs, battery, bluetooth, network, playback, showVisualizer, microphone, tray, plugins]
  )
}
