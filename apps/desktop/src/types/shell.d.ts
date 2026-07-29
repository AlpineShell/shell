export {}

declare global {
interface OpenApp {
  id: number
  hwnd: number
  name: string
  title: string
  path: string
  icon: string
}

interface StartupEntry {
  id: string
  name: string
  friendlyName: string
  blurb: string | null
  category: 'app' | 'system' | 'unknown'
  locked: boolean
  command: string
  target: string | null
  icon: string | null
  source: 'registry' | 'folder' | 'task' | 'msix'
  sourceLabel: string
  scope: 'user' | 'system'
  enabled: boolean
  pending: 'enable' | 'disable' | null
  running: boolean
  location: string
  missing: boolean
}

interface RunningApp {
  name: string
  friendlyName: string
  category: 'app' | 'system' | 'unknown'
  band: 'light' | 'moderate' | 'heavy'
  path: string | null
  icon: string | null
  memory: number
  cpu: number
  count: number
  pids: number[]
  hasWindow: boolean
}

interface StartupHistoryEntry {
  seq: number
  id: string
  name: string
  from: boolean
  to: boolean
  scope: 'user' | 'system'
}

interface InstalledApp {
  id: string
  name: string
  publisher: string | null
  version: string | null
  icon: string | null
  source: 'desktop' | 'store'
  isComponent: boolean
  startupId: string | null
  canUninstall: boolean
  canOpen: boolean
  canOpenLocation: boolean
}

interface NetworkStatus {
  signal: number | null
  connected: boolean
  type: 'wifi' | 'ethernet'
  ssid: string | null
}

interface BluetoothState {
  enabled: boolean
  connected: boolean
  devices: string[]
}

interface TopBarColor {
  r: number
  g: number
  b: number
  darkText: boolean
}

interface ForegroundColorData extends TopBarColor {
  displayId: number
}

type ForegroundColorBroadcast = ForegroundColorData | { displayId: number }
}

declare global {
  type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

  interface UpdateState {
    status: UpdateStatus
    currentVersion: string
    availableVersion: string | null
    progressPercent: number
    error: string | null
  }

  interface UpdateLogEntry {
    time: number
    level: 'info' | 'error'
    message: string
  }

  type WindowsUpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'installing' | 'restart-required' | 'installed' | 'error'

  type WindowsUpdateTier = 'quality' | 'enablement' | 'feature'

  interface WindowsUpdateItem {
    title: string
    kb: string | null
    sizeBytes: number
    updateId: string
    isFeatureUpdate: boolean
    tier: WindowsUpdateTier
  }

  interface WindowsUpdateState {
    status: WindowsUpdateStatus
    updates: WindowsUpdateItem[]
    lastCheckedAt: number | null
    rebootRequired: boolean
    progressPercent: number
    progressLabel: string | null
    installingId: string | null
    error: string | null
  }

  interface WifiNetwork {
    ssid: string
    signal: number
    security: string
    connected: boolean
  }

  interface BluetoothDevice {
    name: string
    instanceId: string
    connected: boolean
    paired: boolean
  }

  interface MediaPlayback {
    title: string | null
    artist: string | null
    appName: string | null
    appIcon: string | null
    playing: boolean
    thumbnail: string | null
    thumbnailType: string | null
  }

  interface MicrophoneStatus {
    active: boolean
    apps: string[]
  }

  interface AltTabWindow {
    hwnd: number
    title: string
    processName: string
    icon: string
    thumbnail: string
  }

  interface AltTabShowPayload {
    windows: AltTabWindow[]
    selectedIndex: number
  }

  interface ScreenshotShowPayload {
    image: string
  }
  interface BatteryStatus {
    percent: number | null
    charging: boolean
    hasBattery: boolean
  }

  interface MonitorInfo {
    id: string
    name: string
    type: 'internal' | 'external'
    brightness: number
  }

  type DisplayOrientation = 0 | 90 | 180 | 270

  interface DisplayInfo {
    id: string
    name: string
    x: number
    y: number
    width: number
    height: number
    orientation: DisplayOrientation
    refreshRate: number
    primary: boolean
  }

  interface DisplayLayoutEntry {
    id: string
    x: number
    y: number
    orientation: DisplayOrientation
    primary: boolean
  }

  interface DisplayApplyResult {
    ok: boolean
    code: number | null
    device?: string
    displays: DisplayInfo[]
  }

  interface DiskInfo {
    letter: string
    label: string
    total: number
    used: number
    free: number
  }

  interface SystemInfo {
    computerName: string
    user: string
    os: { name: string; version: string; build: string }
    disks: DiskInfo[]
    cpu: { name: string; cores: number; threads: number }
    gpu: { name: string }
    memory: { total: number; used: number; free: number }
    uptime: number
  }

  interface SetupOptions {
    shell: boolean
    cursor: boolean
  }

  interface SetupResult {
    shell: boolean
    startup: boolean
    cursor: boolean
    gpoBlocked: boolean
    error: string | null
  }

  interface RevertResult {
    success: boolean
    gpoBlocked: boolean
    error: string | null
    leftBehind: string[]
  }

  interface SetupStatus {
    isShell: boolean
    hasStartup: boolean
    hasCursor: boolean
    gpoBlocked: boolean
    isInstalled: boolean
    installedVersion: string | null
    currentVersion: string
    isFirstRun: boolean
  }

  type EmojiKeyMessage =
    | { kind: 'char'; value: string }
    | { kind: 'backspace' | 'enter' | 'escape' | 'left' | 'right' | 'up' | 'down' }

  interface LauncherItem {
    id: number
    name: string
    lnkPath: string | null
    target: string
    icon: string | null
    badge?: string | null
    appId?: string
    url?: string
    isBookmark?: boolean
    favicon?: string
  }

  interface Bookmark {
    title: string
    url: string
    favicon?: string
  }

  interface BrowserTab {
    hwnd: number
    browser: string
    index: number
    title: string
    selected: boolean
    favicon?: string
    host?: string
  }

  interface BrowserTabMeta {
    favicon?: string
    host?: string
  }

  interface RunResult {
    kind: "folder" | "file" | "url" | "shell" | "command"
    label: string
    display: string
    runInTerminal: boolean
  }

  interface TrayIcon {
    id: string
    hWnd: number
    uID: number
    guid: string | null
    tooltip: string
    icon: string
    version: number
  }

  interface TrayLayout {
    order: string[]
    hidden: string[]
  }

  interface TrayDisplaySetting {
    showOnAllMonitors: boolean
    primaryDisplayId: number
  }

  interface TraySettings {
    enabled: boolean
    showOverflow: boolean
  }

  type TilingMode = 'snap' | 'dynamic'
  type TilingDynamicLayout = 'bsp' | 'columns' | 'master-stack'

  interface TilingRatios {
    'master-stack'?: Record<string, { master: number; stack?: number[] }>
    columns?: Record<string, { widths: number[] }>
    bsp?: Record<string, { nodes: Record<string, number> }>
  }

  interface TilingConfig {
    enabled: boolean
    mode: TilingMode
    gap: number
    margin: number
    hotkeys: boolean
    dragToZone: boolean
    dynamicLayout: TilingDynamicLayout
    ratios: TilingRatios
    handleOversized: boolean
    centerOversized: boolean
  }

  interface PluginRecord {
    id: string
    name: string
    version: string
    apiVersion: number
    renderer: string | null
    entry?: string | null
    main: string | null
    hasBackend: boolean
    icon: string | null
    description: string | null
    author: { name: string; url?: string; email?: string } | null
    homepage: string | null
    repository: string | null
    license: string | null
    engines: { alpineShell?: string } | null
    contributes: Record<string, unknown[]>
    marketplace: {
      displayName?: string
      logo?: string
      shortDescription?: string
      readme?: string
      screenshots?: { src: string; caption?: string; dark?: boolean }[]
      category?: string
      keywords?: string[]
    } | null
    preset: boolean
    legacy?: boolean
    verified: boolean
    compat: { apiOk: boolean; engineOk: boolean; reason: string | null }
    valid: boolean
    errors: string[]
    enabled: boolean
    loadable: boolean
  }

  type PluginListItem = PluginRecord

  interface MarketplacePlugin {
    id: string
    name: string
    version: string
    shortDescription: string
    description: string
    category: string | null
    iconUrl: string | null
    author: string | null
    verified: boolean
    apiVersion: number
    size: number | null
  }

  interface MarketplaceDetail extends MarketplacePlugin {
    readme: string | null
    homepage: string | null
    repository: string | null
    screenshots: { src: string; caption?: string }[]
  }

  interface MarketplaceIndex {
    base: string
    plugins: MarketplacePlugin[]
  }

  type InstallResult =
    | { ok: true; id: string; version: string; verified: boolean; reason?: string | null }
    | { ok: false; error: string; detail?: string }

  interface DeepInstallRequest {
    id: string
    version: string
  }

  type TopbarSlot = 'left' | 'center' | 'right'

  interface TopbarWidgetContribution {
    type: 'topbar-widget'
    id: string
    component: import('react').ComponentType
    slot?: TopbarSlot
    order?: number
  }

  type AlpineHtml = (strings: TemplateStringsArray, ...values: unknown[]) => import('react').ReactNode

  interface AlpineStoreRuntime {
    createStore: typeof import('zustand/vanilla').createStore
    useStore: typeof import('zustand').useStore
    useShallow: typeof import('zustand/react/shallow').useShallow
  }

  interface PluginCommandResult<T = unknown> {
    ok: boolean
    value?: T
    error?: string
  }

  interface AlpinePluginRuntime {
    version: number
    React: typeof import('react')
    react: typeof import('react')
    reactDom: typeof import('react-dom')
    jsxRuntime: typeof import('react/jsx-runtime')
    h: typeof import('react').createElement
    html: AlpineHtml
    Fragment: typeof import('react').Fragment
    useState: typeof import('react').useState
    useEffect: typeof import('react').useEffect
    useRef: typeof import('react').useRef
    useMemo: typeof import('react').useMemo
    useCallback: typeof import('react').useCallback
    useReducer: typeof import('react').useReducer
    useContext: typeof import('react').useContext
    createContext: typeof import('react').createContext
    useSyncExternalStore: typeof import('react').useSyncExternalStore
    useLayoutEffect: typeof import('react').useLayoutEffect
    useId: typeof import('react').useId
    memo: typeof import('react').memo
    lazy: typeof import('react').lazy
    Suspense: typeof import('react').Suspense
    startTransition: typeof import('react').startTransition
    useDarkText: () => boolean
    useTopbarBg: () => string
    usePluginData: <T>(channel: string, initial: T) => T
    sendCommand: (pluginId: string, name: string, payload?: unknown) => Promise<PluginCommandResult>
    store: AlpineStoreRuntime
    PopupMenu: import('react').ComponentType<{
      trigger: import('react').ReactNode
      children: import('react').ReactNode
      onOpen?: () => void
    }>
  }

  type TimeFormat = 'auto' | '12h' | '24h'
  type ResolvedTimeFormat = '12h' | '24h'
  type CalendarDayCount = 1 | 2 | 3

  interface ClockPrefs {
    timeFormat: TimeFormat
    systemTimeFormat: ResolvedTimeFormat
    calendarDays: CalendarDayCount
    showTasks: boolean
  }

  interface CalendarConnection {
    connected: boolean
    email: string | null
    hasCredentials: boolean
    connecting: boolean
    error: string | null
  }

  interface CalendarEvent {
    id: string
    calendarId: string
    title: string
    description: string | null
    location: string | null
    start: string
    end: string
    allDay: boolean
    color: string
  }

  interface CalendarTask {
    id: string
    title: string
    due: string | null
    completed: boolean
    listTitle: string | null
  }

  interface CalendarData {
    events: CalendarEvent[]
    tasks: CalendarTask[]
    fetchedAt: number | null
    error: string | null
  }

  interface CalendarRange {
    startOffset: number
    dayCount: number
  }

  type ShellNoticeTone = 'info' | 'success' | 'error'

  interface ShellNotice {
    id: string
    displayId: number | null
    title: string | null
    message: string
    tone: ShellNoticeTone
    busy: boolean
    pill: boolean
    action: { label: string } | null
    confirm: { label: string; cancelLabel: string } | null
  }

  interface FileHandlerState {
    extension: string
    pluginId: string
    pluginName: string
    progId: string
    holder: string | null
    isDefault: boolean
  }

  interface Window {
    fileHandlers: {
      state: () => Promise<FileHandlerState[]>
      chooseDefault: () => Promise<void>
    }
    notice: {
      current: () => Promise<ShellNotice | null>
      onShow: (callback: (notice: ShellNotice) => void) => () => void
      onHide: (callback: () => void) => () => void
      runAction: () => Promise<{ ok: boolean }>
      confirm: () => Promise<{ ok: boolean }>
      dismiss: () => Promise<{ ok: boolean }>
    }
    plugins: {
      list: () => Promise<PluginRecord[]>
      dir: () => Promise<string>
      openFolder: () => Promise<void>
      reload: () => Promise<boolean>
      setEnabled: (id: string, enabled: boolean) => Promise<boolean>
      manifest: (id: string) => Promise<PluginRecord | null>
      readme: (id: string) => Promise<string | null>
      marketplace: {
        base: () => Promise<string>
        list: () => Promise<MarketplaceIndex>
        detail: (id: string) => Promise<MarketplaceDetail | null>
        install: (payload: { id: string; version?: string }) => Promise<InstallResult>
        uninstall: (id: string) => Promise<{ ok: boolean; id?: string; error?: string }>
        openWeb: (id: string) => Promise<boolean>
      }
      onDeepInstall: (callback: (payload: DeepInstallRequest) => void) => () => void
      command: <T = unknown>(id: string, name: string, payload?: unknown) => Promise<PluginCommandResult<T>>
      getData: <T = unknown>(channel: string) => Promise<T | null>
      onData: <T = unknown>(channel: string, callback: (data: T) => void) => () => void
      onReload: (callback: () => void) => () => void
    }
    alpine?: AlpinePluginRuntime
    setup: {
      status: () => Promise<SetupStatus>
      install: (options: SetupOptions) => Promise<SetupResult>
      skip: () => Promise<void>
      testOut: () => Promise<void>
      relaunch: () => Promise<void>
      restartWindows: () => Promise<void>
      revertTemporary: () => Promise<RevertResult>
      revertPermanent: () => Promise<RevertResult>
      setShell: () => Promise<{ success: boolean }>
      uninstall: () => Promise<RevertResult>
      onProgress: (callback: (step: string) => void) => void
    }
    launcher: {
      index: () => Promise<LauncherItem[]>
      show: () => Promise<void>
      hide: () => Promise<void>
      reportPanelBottom: (bottom: number) => Promise<void>
      launch: (id: number) => Promise<{ success: boolean }>
      launchAdmin: (id: number) => Promise<{ success: boolean }>
      uninstall: (id: number) => Promise<{ ok: boolean; mode: 'store' | 'desktop' | 'settings' | 'none' }>
      openLocation: (id: number) => Promise<{ success: boolean }>
      closeWindow: (hwnd: number) => Promise<{ success: boolean }>
      endTask: (pid: number) => Promise<{ success: boolean }>
      insertText: (text: string) => Promise<{ ok: boolean }>
      recentEmoji: () => Promise<string[]>
      addRecentEmoji: (char: string) => Promise<string[]>
      onEmojiKey: (callback: (message: EmojiKeyMessage) => void) => () => void
      getHotkey: () => Promise<string>
      setHotkey: (hotkey: string) => Promise<string>
      defaultHotkey: () => Promise<string>
      onHotkeyChanged: (callback: (hotkey: string) => void) => void
      onShow: (callback: (data: { displayId: number; mode?: string }) => void) => void
      onStartClose: (callback: () => void) => () => void
      onHide: (callback: () => void) => () => void
      scores: () => Promise<Record<string, number>>
      onScoresChanged: (callback: (data: Record<string, number>) => void) => () => void
      recentApps: () => Promise<boolean>
      setRecentApps: (value: boolean) => Promise<boolean>
      onRecentAppsChanged: (callback: (value: boolean) => void) => () => void
      showBookmarks: () => Promise<boolean>
      setShowBookmarks: (value: boolean) => Promise<boolean>
      onShowBookmarksChanged: (callback: (value: boolean) => void) => () => void
      showBrowserTabs: () => Promise<boolean>
      setShowBrowserTabs: (value: boolean) => Promise<boolean>
      onShowBrowserTabsChanged: (callback: (value: boolean) => void) => () => void
      maxResults: () => Promise<number>
      setMaxResults: (value: number) => Promise<number>
      onMaxResultsChanged: (callback: (value: number) => void) => () => void
    }
    screenshot: {
      onShow: (callback: (data: ScreenshotShowPayload) => void) => void
      onHide: (callback: () => void) => void
      ready: () => Promise<void>
      regionSelected: (region: { x: number; y: number; width: number; height: number }) => Promise<void>
      cancel: () => Promise<void>
    }
    alttab: {
      onShow: (callback: (data: AltTabShowPayload) => void) => void
      onHide: (callback: () => void) => void
      onSelectionChanged: (callback: (index: number) => void) => void
      activate: (hwnd: number) => Promise<void>
    }
    topbar: {
      setActiveRegion: (region: { top: number; bottom: number; left: number; right: number } | null) => void
      color: () => Promise<TopBarColor | null>
      onColorChanged: (callback: (color: TopBarColor) => void) => () => void
      colorOverride: () => Promise<TopBarColor | null>
      setColorOverride: (color: { r: number; g: number; b: number } | null) => Promise<TopBarColor | null>
      colorPalette: () => Promise<TopBarColor[]>
      searchIcon: () => Promise<boolean>
      setSearchIcon: (value: boolean) => Promise<boolean>
      onSearchIconChanged: (callback: (visible: boolean) => void) => () => void
      mediaVisualizer: () => Promise<boolean>
      setMediaVisualizer: (value: boolean) => Promise<boolean>
      onMediaVisualizerChanged: (callback: (value: boolean) => void) => () => void
      foregroundColor: () => Promise<ForegroundColorData[]>
      onForegroundColorChanged: (callback: (data: ForegroundColorBroadcast) => void) => () => void
      onCloseMenus: (callback: () => void) => () => void
    }
    shell: {
      settingsIcon: string
      windows: {
        wallpaper: () => Promise<string | null>
        onWallpaperChanged: (callback: (data: string | null) => void) => () => void
        setWallpaper: (filePath: string) => Promise<boolean>
        pickWallpaper: () => Promise<string | null>
        wallpaperPresets: () => Promise<{ name: string; path: string; thumbnail: string; url: string }[]>
        wallpaperMine: () => Promise<{ name: string; path: string; thumbnail: string; url: string; addedAt: number }[]>
        wallpaperMineDelete: (filePath: string) => Promise<boolean>
        openApps: () => Promise<OpenApp[]>
        onOpenAppsChanged: (callback: (data: OpenApp[]) => void) => () => void
        openSettings: (page?: string) => Promise<void>
        closeSettings: () => Promise<void>
        setSettingsPage: (name: string) => Promise<void>
        initialPage: string | null
        onSettingsNavigate: (callback: (page: string) => void) => () => void
      }
      run: {
        resolve: (query: string) => Promise<RunResult | null>
        exec: (query: string) => Promise<{ ok: boolean }>
        execTerminal: (query: string) => Promise<{ ok: boolean }>
      }
      apps: {
        startup: () => Promise<StartupEntry[]>
        onStartupChanged: (callback: (data: StartupEntry[]) => void) => () => void
        setStartup: (id: string, enabled: boolean) => Promise<StartupEntry[]>
        clearPending: (id: string) => Promise<StartupEntry[]>
        removeStartup: (id: string) => Promise<{ ok: boolean; error?: string }>
        applySystemChanges: () => Promise<{ ok: boolean; error?: string }>
        history: () => Promise<StartupHistoryEntry[]>
        onStartupHistoryChanged: (callback: (data: StartupHistoryEntry[]) => void) => void
        undo: (seq: number) => Promise<StartupEntry[]>
        running: () => Promise<RunningApp[]>
        endTask: (pids: number[]) => Promise<{ ok: boolean }>
        openLocation: (target: string) => Promise<{ ok: boolean }>
        installed: () => Promise<InstalledApp[]>
        onInstalledChanged: (callback: (data: InstalledApp[]) => void) => void
        uninstall: (id: string) => Promise<{ ok: boolean; error?: string }>
        openApp: (id: string) => Promise<{ ok: boolean }>
        openAppLocation: (id: string) => Promise<{ ok: boolean }>
        catalog: () => Promise<LauncherItem[]>
        onCatalogChanged: (callback: (data: LauncherItem[]) => void) => () => void
        launch: (id: number) => Promise<{ success: boolean }>
        launchAdmin: (id: number) => Promise<{ success: boolean }>
        windowCommand: (action: 'minimize' | 'maximize' | 'close') => Promise<{ ok: boolean }>
        launchableOpenLocation: (id: number) => Promise<{ success: boolean }>
        launchableUninstall: (id: number) => Promise<{ success: boolean }>
      }
      bookmarks: {
        list: () => Promise<Bookmark[]>
        onChanged: (callback: (data: Bookmark[]) => void) => () => void
        open: (url: string) => Promise<{ ok: boolean }>
      }
      browserTabs: {
        list: () => Promise<BrowserTab[]>
        onChanged: (callback: (data: BrowserTab[]) => void) => () => void
        activate: (tab: BrowserTab) => Promise<{ ok: boolean }>
      }
      network: {
        wifiSignal: () => Promise<NetworkStatus>
        onWifiSignalChanged: (callback: (data: NetworkStatus) => void) => void
        wifiScan: () => Promise<WifiNetwork[] | null>
        wifiNetworks: () => Promise<WifiNetwork[]>
        onWifiScanUpdated: (callback: (data: WifiNetwork[]) => void) => () => void
        wifiConnect: (ssid: string, password?: string) => Promise<{ success: boolean; needsPassword?: boolean }>
        wifiDisconnect: () => Promise<{ success: boolean }>
        wifiRadioGet: () => Promise<{ success: boolean; state: string }>
        wifiRadioSet: (enabled: boolean) => Promise<{ success: boolean; state: string }>
      }
      system: {
        bluetooth: () => Promise<BluetoothState>
        onBluetoothChanged: (callback: (data: BluetoothState) => void) => () => void
        onBluetoothDevicesChanged: (callback: (data: BluetoothDevice[]) => void) => () => void
        bluetoothScan: () => Promise<BluetoothDevice[]>
        bluetoothDevices: () => Promise<BluetoothDevice[]>
        bluetoothToggle: (instanceId: string, action: 'connect' | 'disconnect') => Promise<{ success: boolean }>
        bluetoothUnpair: (instanceId: string) => Promise<{ success: boolean }>
        bluetoothOpenSettings: () => Promise<void>
        bluetoothSetRadio: (enabled: boolean) => Promise<{ success: boolean; state: string }>
        volume: () => Promise<number>
        setVolume: (value: number) => Promise<number>
        onVolumeChanged: (callback: (data: number) => void) => () => void
        mute: () => Promise<boolean>
        setMute: (muted: boolean) => Promise<boolean>
        onMuteChanged: (callback: (data: boolean) => void) => () => void
        subscribePeak: () => Promise<boolean>
        unsubscribePeak: () => Promise<boolean>
        onAudioPeak: (callback: (peak: number) => void) => () => void
        brightness: () => Promise<number>
        setBrightness: (value: number) => Promise<number>
        onBrightnessChanged: (callback: (data: number) => void) => void
        getMonitors: () => Promise<MonitorInfo[]>
        setMonitorBrightness: (id: string, value: number) => Promise<number>
        onMonitorsChanged: (callback: (data: MonitorInfo[]) => void) => () => void
        getDisplays: () => Promise<DisplayInfo[]>
        applyDisplayLayout: (layout: DisplayLayoutEntry[]) => Promise<DisplayApplyResult>
        keepDisplayLayout: () => Promise<{ ok: boolean }>
        revertDisplayLayout: () => Promise<DisplayInfo[]>
        onDisplaysChanged: (callback: (data: DisplayInfo[]) => void) => () => void
        powerAction: (action: 'shutdown' | 'restart' | 'logout') => Promise<void>
        info: () => Promise<SystemInfo>
        battery: () => Promise<BatteryStatus>
        onBatteryChanged: (callback: (data: BatteryStatus) => void) => () => void
      }
      media: {
        session: () => Promise<MediaPlayback>
        onSessionChanged: (callback: (data: MediaPlayback) => void) => () => void
        control: (action: 'play' | 'pause' | 'toggle' | 'next' | 'previous') => Promise<{ success: boolean }>
        microphone: () => Promise<MicrophoneStatus>
        onMicrophoneChanged: (callback: (data: MicrophoneStatus) => void) => () => void
      }
      tray: {
        icons: () => Promise<TrayIcon[]>
        onIconsChanged: (callback: (data: TrayIcon[]) => void) => void
        click: (id: string, button: 'left' | 'right', x: number, y: number) => Promise<void>
        layout: () => Promise<TrayLayout>
        setLayout: (layout: TrayLayout) => Promise<TrayLayout>
        onLayoutChanged: (callback: (data: TrayLayout) => void) => void
        display: () => Promise<TrayDisplaySetting>
        setDisplay: (showOnAllMonitors: boolean) => Promise<TrayDisplaySetting>
        onDisplayChanged: (callback: (data: TrayDisplaySetting) => void) => void
        settings: () => Promise<TraySettings>
        setSettings: (partial: Partial<TraySettings>) => Promise<TraySettings>
        onSettingsChanged: (callback: (data: TraySettings) => void) => void
      }
      updates: {
        getState: () => Promise<UpdateState>
        getLog: () => Promise<UpdateLogEntry[]>
        check: () => Promise<UpdateState>
        download: () => Promise<void>
        install: () => Promise<void>
        onStateChanged: (callback: (state: UpdateState) => void) => void
        onLogChanged: (callback: (entries: UpdateLogEntry[]) => void) => void
      }
      windowsUpdate: {
        getState: () => Promise<WindowsUpdateState>
        check: () => Promise<WindowsUpdateState>
        install: (updateId?: string) => Promise<WindowsUpdateState>
        openWindowsUpdate: () => Promise<{ ok: boolean }>
        onStateChanged: (callback: (state: WindowsUpdateState) => void) => void
      }
      tiling: {
        config: () => Promise<TilingConfig>
        setConfig: (partial: Partial<TilingConfig>) => Promise<TilingConfig>
        onConfigChanged: (callback: (config: TilingConfig) => void) => () => void
        snap: (direction: 'left' | 'right' | 'up' | 'down') => Promise<boolean>
      }
      clock: {
        prefs: () => Promise<ClockPrefs>
        setPrefs: (partial: Partial<ClockPrefs>) => Promise<ClockPrefs>
        onPrefsChanged: (callback: (data: ClockPrefs) => void) => () => void
        initial: ClockPrefs | null
      }
      calendar: {
        state: () => Promise<CalendarConnection>
        onStateChanged: (callback: (data: CalendarConnection) => void) => () => void
        connect: () => Promise<CalendarConnection>
        disconnect: () => Promise<CalendarConnection>
        data: () => Promise<CalendarData>
        onDataChanged: (callback: (data: CalendarData) => void) => () => void
        refresh: (range?: CalendarRange) => Promise<CalendarData>
      }
    }
  }
}
