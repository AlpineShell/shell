import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { ThemeProvider } from '../../themeContext'
import Clock from '../clock'
import MicrophoneStatus from '../status/microphoneStatus'
import StatusIndicator from '../status/statusIndicator'
import MediaStatus from '../status/mediaStatus'
import NoticeStatus from '../noticeStatus'
import ClockFace from './clockFace'
import MicrophoneFace from './microphoneFace'
import StatusFace from './statusFace'
import MediaFace from './mediaFace'
import NoticeFace from './noticeFace'
import { UNKNOWN_BLUETOOTH_STATE } from '../../../lib/bluetoothPresentation'

interface BarFixture {
  now: Date
  clockPrefs: ClockPrefs
  calendarConnected: boolean
  microphone: MicrophoneStatus
  battery: BatteryStatus
  bluetooth: BluetoothState
  network: NetworkStatus
  wifiRadioState: 'on' | 'off'
  playback: MediaPlayback
  showVisualizer: boolean
  peak: number
  notice: ShellNotice | null
}

interface ParityCase {
  name: string
  arrange: (fixture: BarFixture) => void
  live: ReactElement
  face: (darkText: boolean) => ReactElement | null
}

const bar = vi.hoisted(() => ({ fixture: {} as BarFixture }))
const LIVE_VOLUME = vi.hoisted(() => ({ level: 0.5, showing: false }))

vi.mock('../shared/popupMenu', () => ({ default: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</> }))
vi.mock('../calendar/calendarFlyout', () => ({ default: () => null }))
vi.mock('../status/controlCenter', () => ({ default: () => null }))
vi.mock('../status/mediaMenu', () => ({ default: () => null }))
vi.mock('../../../hooks/useClockPrefs', () => ({ useClockPrefs: () => ({ prefs: bar.fixture.clockPrefs }) }))
vi.mock('../../../hooks/useCalendar', () => ({ useCalendar: () => ({ state: { connected: bar.fixture.calendarConnected } }) }))
vi.mock('../../../hooks/useMinuteTick', () => ({ useMinuteTick: () => bar.fixture.now }))
vi.mock('../../../hooks/useMicrophone', () => ({ useMicrophone: () => bar.fixture.microphone }))
vi.mock('../../../hooks/useBattery', () => ({ useBattery: () => bar.fixture.battery }))
vi.mock('../../../hooks/useBluetooth', () => ({ useBluetooth: () => ({ state: bar.fixture.bluetooth }) }))
vi.mock('../../../hooks/useNetwork', () => ({ useNetworkStatus: () => bar.fixture.network }))
vi.mock('../../../hooks/useWifi', () => ({ useWifi: () => ({ radio: bar.fixture.wifiRadioState, networks: [], scanning: false, operation: null, lastError: null, ethernet: false, offForEthernet: false, blockedByEthernet: false }) }))
vi.mock('../../../hooks/useVolume', () => ({ useVolume: () => ({ volume: 50, setVolume: () => {}, muted: false, toggleMute: () => {} }) }))
vi.mock('../../../hooks/useMonitors', () => ({ useMonitors: () => ({ monitors: [], setBrightness: () => {} }) }))
vi.mock('../../../hooks/useMediaSession', () => ({ useMediaSession: () => ({ ...bar.fixture.playback, control: () => {}, update: () => {} }) }))
vi.mock('../../../hooks/useMediaVisualizer', () => ({ useMediaVisualizer: () => bar.fixture.showVisualizer }))
vi.mock('../../../hooks/useMediaTimeline', () => ({ useMediaTimeline: () => null }))
vi.mock('../../../hooks/useAudioPeak', () => ({ useAudioPeak: () => bar.fixture.peak }))
vi.mock('../../../hooks/useVolumeFeedback', () => ({ useVolumeFeedback: () => LIVE_VOLUME }))
vi.mock('../../../hooks/useShellNotice', () => ({ useShellNotice: () => bar.fixture.notice }))

const APP_ICON = 'iVBORw0KGgo='

const PLAYBACK: MediaPlayback = {
  title: 'Blue in Green',
  artist: 'Miles Davis',
  appName: 'Spotify',
  appIcon: APP_ICON,
  playing: true,
  thumbnail: null,
  thumbnailType: null,
}

const CONNECTED_BLUETOOTH: BluetoothState = {
  radio: { state: 'on', pending: null, error: null },
  devices: [
    {
      id: 'wh-1000xm4',
      name: 'WH-1000XM4',
      kind: 'headphones',
      connected: true,
      canConnect: false,
      canDisconnect: true,
      audioDisabled: false,
      pending: null,
      error: null,
    },
  ],
  devicesAvailable: true,
}

const BLUETOOTH_OFF: BluetoothState = { ...CONNECTED_BLUETOOTH, radio: { state: 'off', pending: null, error: null } }

const NOTICE: ShellNotice = {
  id: 'file-handler',
  displayId: null,
  title: 'Android',
  message: 'Reading IG.apk',
  tone: 'error',
  busy: false,
  pill: true,
  action: null,
  confirm: null,
}

function freshFixture(): BarFixture {
  return {
    now: new Date(2026, 8, 12, 21, 41),
    clockPrefs: { timeFormat: 'auto', systemTimeFormat: '24h', calendarDays: 1, showTasks: true },
    calendarConnected: false,
    microphone: { active: false, apps: [] },
    battery: { percent: 64, charging: false, onAcPower: false, hasBattery: true },
    bluetooth: CONNECTED_BLUETOOTH,
    network: { signal: 55, connected: true, type: 'wifi', ssid: 'Home', wifi: { connected: true, ssid: 'Home', signal: 55 } },
    wifiRadioState: 'on',
    playback: PLAYBACK,
    showVisualizer: true,
    peak: 0.6,
    notice: null,
  }
}

const statusFace = (darkText: boolean, over: Partial<Omit<StatusFaceProps, 'darkText'>> = {}) => (
  <StatusFace
    bluetooth={CONNECTED_BLUETOOTH}
    network={{ signal: 55, connected: true, type: 'wifi', ssid: 'Home', wifi: { connected: true, ssid: 'Home', signal: 55 } }}
    wifiRadio="on"
    battery={{ percent: 64, charging: false, hasBattery: true }}
    darkText={darkText}
    {...over}
  />
)

const PARITY_CASES: ParityCase[] = [
  {
    name: 'Clock following a 24-hour Windows',
    arrange: () => {},
    live: <Clock />,
    face: (darkText) => <ClockFace time="21:41" date="Sep 12" darkText={darkText} />,
  },
  {
    name: 'Clock set to 12 hours with a calendar connected',
    arrange: (fixture) => {
      fixture.clockPrefs = { ...fixture.clockPrefs, timeFormat: '12h' }
      fixture.calendarConnected = true
    },
    live: <Clock />,
    face: (darkText) => <ClockFace time="9:41 PM" date="Sep 12" darkText={darkText} />,
  },
  {
    name: 'MicrophoneStatus naming the apps that listen',
    arrange: (fixture) => {
      fixture.microphone = { active: true, apps: ['Zoom', 'Teams'] }
    },
    live: <MicrophoneStatus />,
    face: (darkText) => <MicrophoneFace apps={['Zoom', 'Teams']} darkText={darkText} />,
  },
  {
    name: 'MicrophoneStatus without app names',
    arrange: (fixture) => {
      fixture.microphone = { active: true, apps: [] }
    },
    live: <MicrophoneStatus />,
    face: (darkText) => <MicrophoneFace apps={[]} darkText={darkText} />,
  },
  {
    name: 'MicrophoneStatus while nothing listens',
    arrange: () => {},
    live: <MicrophoneStatus />,
    face: () => null,
  },
  {
    name: 'StatusIndicator with the Wi-Fi radio on',
    arrange: () => {},
    live: <StatusIndicator />,
    face: (darkText) => statusFace(darkText),
  },
  {
    name: 'StatusIndicator with the Wi-Fi radio off',
    arrange: (fixture) => {
      fixture.wifiRadioState = 'off'
    },
    live: <StatusIndicator />,
    face: (darkText) => statusFace(darkText, { wifiRadio: 'off' }),
  },
  {
    name: 'StatusIndicator on a machine without a battery',
    arrange: (fixture) => {
      fixture.battery = { percent: null, charging: false, onAcPower: true, hasBattery: false }
    },
    live: <StatusIndicator />,
    face: (darkText) => statusFace(darkText, { battery: { percent: null, charging: false, hasBattery: false } }),
  },
  {
    name: 'StatusIndicator with Bluetooth off',
    arrange: (fixture) => {
      fixture.bluetooth = BLUETOOTH_OFF
    },
    live: <StatusIndicator />,
    face: (darkText) => statusFace(darkText, { bluetooth: BLUETOOTH_OFF }),
  },
  {
    name: 'StatusIndicator while Bluetooth is still being checked',
    arrange: (fixture) => {
      fixture.bluetooth = UNKNOWN_BLUETOOTH_STATE
    },
    live: <StatusIndicator />,
    face: (darkText) => statusFace(darkText, { bluetooth: UNKNOWN_BLUETOOTH_STATE }),
  },
  {
    name: 'MediaStatus drawing the music bars',
    arrange: () => {},
    live: <MediaStatus />,
    face: (darkText) => <MediaFace title="Blue in Green" appIcon={null} peak={0.6} darkText={darkText} volume={LIVE_VOLUME} />,
  },
  {
    name: 'MediaStatus showing the app icon',
    arrange: (fixture) => {
      fixture.showVisualizer = false
    },
    live: <MediaStatus />,
    face: (darkText) => <MediaFace title="Blue in Green" appIcon={APP_ICON} peak={0.6} darkText={darkText} volume={LIVE_VOLUME} />,
  },
  {
    name: 'MediaStatus with nothing playing',
    arrange: (fixture) => {
      fixture.playback = { ...PLAYBACK, title: null }
    },
    live: <MediaStatus />,
    face: () => null,
  },
  {
    name: 'NoticeStatus showing a pill',
    arrange: (fixture) => {
      fixture.notice = NOTICE
    },
    live: <NoticeStatus />,
    face: (darkText) => <NoticeFace notice={{ title: 'Android', message: 'Reading IG.apk', tone: 'error', busy: false }} darkText={darkText} />,
  },
  {
    name: 'NoticeStatus showing a busy pill',
    arrange: (fixture) => {
      fixture.notice = { ...NOTICE, busy: true }
    },
    live: <NoticeStatus />,
    face: (darkText) => <NoticeFace notice={{ title: 'Android', message: 'Reading IG.apk', tone: 'error', busy: true }} darkText={darkText} />,
  },
  {
    name: 'NoticeStatus with a notice that is not a pill',
    arrange: (fixture) => {
      fixture.notice = { ...NOTICE, pill: false }
    },
    live: <NoticeStatus />,
    face: () => null,
  },
]

function onBar(ui: ReactElement, darkText: boolean) {
  return (
    <ThemeProvider value={{ darkText, bg: 'rgb(31,32,32)', onMenuOpenChange: () => {} }}>
      {ui}
    </ThemeProvider>
  )
}

async function liveMarkup(ui: ReactElement, darkText: boolean) {
  const { container } = render(onBar(ui, darkText))
  await act(async () => {})
  return container.innerHTML
}

function faceMarkup(face: ReactElement | null) {
  return face ? render(face).container.innerHTML : ''
}

beforeEach(() => {
  bar.fixture = freshFixture()
  ;(window as unknown as { shell: unknown }).shell = { network: {} }
  ;(window as unknown as { screenshot: unknown }).screenshot = { onSaved: () => () => undefined }
})

afterEach(() => {
  delete (window as unknown as { shell?: unknown }).shell
  delete (window as unknown as { screenshot?: unknown }).screenshot
})

describe.each(PARITY_CASES)('$name', ({ arrange, live, face }) => {
  it.each([true, false])('draws exactly its face when darkText is %s', async (darkText) => {
    arrange(bar.fixture)
    expect(await liveMarkup(live, darkText)).toBe(faceMarkup(face(darkText)))
  })
})
