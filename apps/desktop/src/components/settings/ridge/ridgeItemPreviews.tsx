import type { ReactElement } from 'react'
import SystemMenuFace from '../../topbar/faces/systemMenuFace'
import NoticeFace from '../../topbar/faces/noticeFace'
import LauncherFace from '../../topbar/faces/launcherFace'
import TrayFace from '../../topbar/faces/trayFace'
import MediaFace from '../../topbar/faces/mediaFace'
import MicrophoneFace from '../../topbar/faces/microphoneFace'
import StatusFace from '../../topbar/faces/statusFace'
import ClockFace from '../../topbar/faces/clockFace'
import { formatClock, formatClockDate, resolveTimeFormat } from '../../topbar/calendar/calendarLayout'
import RidgeLivePluginWidgets from './ridgeLivePluginWidgets'
import {
  RIDGE_SAMPLE_MEDIA_TITLE,
  RIDGE_SAMPLE_MICROPHONE_APPS,
  RIDGE_SAMPLE_NOTICE,
  RIDGE_SAMPLE_PEAK,
  ridgeItemIsSample,
  ridgeMediaTitle,
  ridgeSampleTrayIcons,
  trayCaretShown,
} from './ridgeSamples'

const WIFI_RADIO_ASSUMED_ON = true
const RESTING_PEAK = 0

function asSample(face: ReactElement): ReactElement {
  return (
    <span data-sample className="contents">
      {face}
    </span>
  )
}

export function SystemMenuPreview({ darkText }: RidgeItemPreviewProps) {
  return <SystemMenuFace darkText={darkText} />
}

export function LeftPluginsPreview({ data, darkText }: RidgeItemPreviewProps) {
  return <RidgeLivePluginWidgets slot="left" data={data} darkText={darkText} />
}

export function NoticePreview({ darkText }: RidgeItemPreviewProps) {
  return asSample(<NoticeFace notice={RIDGE_SAMPLE_NOTICE} darkText={darkText} />)
}

export function LauncherPreview({ darkText }: RidgeItemPreviewProps) {
  return <LauncherFace darkText={darkText} />
}

export function TrayPreview({ data, darkText }: RidgeItemPreviewProps) {
  if (ridgeItemIsSample('tray', data)) {
    return asSample(<TrayFace icons={ridgeSampleTrayIcons(darkText)} showCaret={false} darkText={darkText} />)
  }
  return <TrayFace icons={data.tray.visible} showCaret={trayCaretShown(data.tray)} darkText={darkText} />
}

export function MediaPreview({ data, darkText }: RidgeItemPreviewProps) {
  const title = ridgeMediaTitle(data.media)
  if (title === null) {
    return asSample(<MediaFace title={RIDGE_SAMPLE_MEDIA_TITLE} appIcon={null} peak={RIDGE_SAMPLE_PEAK} darkText={darkText} />)
  }
  const { playback, showVisualizer } = data.media
  return (
    <MediaFace
      title={title}
      appIcon={showVisualizer ? null : playback.appIcon}
      peak={playback.playing ? RIDGE_SAMPLE_PEAK : RESTING_PEAK}
      darkText={darkText}
    />
  )
}

export function MicrophonePreview({ data, darkText }: RidgeItemPreviewProps) {
  if (ridgeItemIsSample('microphone', data)) {
    return asSample(<MicrophoneFace apps={RIDGE_SAMPLE_MICROPHONE_APPS} darkText={darkText} />)
  }
  return <MicrophoneFace apps={data.microphone.apps} darkText={darkText} />
}

export function StatusPreview({ data, darkText }: RidgeItemPreviewProps) {
  const { battery, bluetooth, network } = data.status
  return <StatusFace battery={battery} bluetooth={bluetooth} network={network} radioOn={WIFI_RADIO_ASSUMED_ON} darkText={darkText} />
}

export function RightPluginsPreview({ data, darkText }: RidgeItemPreviewProps) {
  return <RidgeLivePluginWidgets slot="right" data={data} darkText={darkText} />
}

export function ClockPreview({ data, darkText }: RidgeItemPreviewProps) {
  const { now, prefs } = data.clock
  return <ClockFace time={formatClock(now, resolveTimeFormat(prefs))} date={formatClockDate(now)} darkText={darkText} />
}
