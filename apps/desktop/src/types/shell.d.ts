export {}

declare global {
  type ThemeName = 'light' | 'dark'

  interface ThemeState {
    name: ThemeName
    background: string
  }

  interface ValueRowProps {
    entry: SettingsValueEntry
    description: string
    info?: string
    wideControlStacked?: boolean
  }

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

type BluetoothRadioState = 'on' | 'off' | 'unavailable' | 'unknown'

type BluetoothRadioError = 'set-failed' | 'denied'

interface BluetoothRadio {
  state: BluetoothRadioState
  pending: 'on' | 'off' | null
  error: BluetoothRadioError | null
}

interface BluetoothState {
  radio: BluetoothRadio
  devices: BluetoothDevice[]
  devicesAvailable: boolean
}

type BluetoothIndicatorKind = 'off' | 'connected' | 'on' | 'neutral'

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

interface TopbarRegionBounds {
  top: number
  bottom: number
  left: number
  right: number
}

interface TopbarActiveRegion extends TopbarRegionBounds {
  contentBounds?: TopbarRegionBounds
}

interface DisplayWindowCoverage {
  displayId: number
  rects: TopbarRegionBounds[]
}
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

  interface UpdatePreferences {
    checkForUpdates: boolean
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

  type BluetoothDeviceOperation = 'connect' | 'disconnect' | 'remove' | 'repair'

  type BluetoothDeviceError =
    | 'connect-failed'
    | 'disconnect-failed'
    | 'remove-failed'
    | 'remove-partial'
    | 'repair-failed'
    | 'repair-cancelled'

  type BluetoothDeviceAction = 'connect' | 'disconnect'

  interface BluetoothDevice {
    id: string
    name: string
    connected: boolean
    canConnect: boolean
    canDisconnect: boolean
    audioDisabled: boolean
    pending: BluetoothDeviceOperation | null
    error: BluetoothDeviceError | null
  }

  interface BluetoothActionResult {
    accepted: boolean
    error?: string
  }

  interface ListSelection {
    id: string
    index: number
  }

  interface AlpineBootState {
    wallpaper: () => string | null
    bluetooth: () => BluetoothState | null
    wifi: () => { status: NetworkStatus | null; radio: boolean } | null
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
    onAcPower: boolean
    hasBattery: boolean
  }

  type BatterySaverReason = 'manual' | 'threshold' | null

  type BatterySaverOverride = 'auto' | 'on' | 'off'

  interface BatterySaverConfig {
    automaticEnabled: boolean
    thresholdPercent: number
    dimDisplays: boolean
    dimExternalDisplays: boolean
    brightnessReductionPercent: number
    reduceBackgroundPolling: boolean
    throttleProcesses: boolean
  }

  interface BatterySaverState {
    active: boolean
    reason: BatterySaverReason
    override: BatterySaverOverride
    percent: number | null
    charging: boolean
    onAcPower: boolean
    hasBattery: boolean
  }

  interface MonitorInfo {
    id: string
    name: string
    type: 'internal' | 'external'
    brightness: number
    brightnessWritable: boolean
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

  interface SetupGateResult {
    error: string | null
  }

  interface SetupShellResult {
    success: boolean
    error: string | null
  }

  type SetupPage = 'signIn' | 'waiting' | 'noLicence' | 'seatsInUse' | 'welcome' | 'options' | 'installing' | 'complete' | 'error'

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

  type LicenceState = 'development' | 'valid' | 'unlicensed'

  type LicenceUnlicensedReason = 'missing' | 'unreadable' | 'unverifiable' | 'device-mismatch' | 'binding-mismatch'

  type LicenceBindingTier = 'tpm' | 'dpapi' | 'machine'

  interface LicenceStatus {
    state: LicenceState
    reason: LicenceUnlicensedReason | null
    email: string | null
    licenceId: string | null
    activationId: string | null
    deviceName: string | null
    activatedAt: string | null
    bindTier: LicenceBindingTier | null
    deviceReadable: boolean
    releaseBuild: boolean
  }

  interface LicenceSeatActivation {
    id: string
    licenceId: string
    deviceName: string
    activatedAt: string | null
  }

  type LicenceActivationOutcome =
    | { kind: 'activated'; email: string | null; licenceId: string | null }
    | { kind: 'no-licence'; email: string | null }
    | { kind: 'seats-in-use'; activations: LicenceSeatActivation[] }
    | { kind: 'move-limit'; retryAt: string | null }
    | { kind: 'mode-mismatch' }
    | { kind: 'replacement-not-yours' }
    | { kind: 'session-expired' }
    | { kind: 'device-unreadable' }
    | { kind: 'unreachable' }
    | { kind: 'error'; message: string }

  type LicenceSignInPhase = 'idle' | 'starting' | 'waiting' | 'activating' | 'done' | 'denied' | 'expired' | 'error'

  interface LicenceSignInProgress {
    phase: LicenceSignInPhase
    userCode: string | null
    verificationUri: string | null
    outcome: LicenceActivationOutcome | null
    error: string | null
  }

  interface LicenceSignInOptions {
    deviceName?: string
  }

  interface LicenceActivateOptions {
    replaceActivationId?: string
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

  type PluginSettingDeclaration = import('@alpine/plugin-sdk').PluginSettingContribution

  type PluginSettingValue = import('@alpine/plugin-sdk').PluginSettingValue

  type PluginSettingValues = import('@alpine/plugin-sdk').PluginSettingValues

  type PluginSettingsPageDeclaration = import('@alpine/plugin-sdk').SettingsPageContribution

  interface PluginSettingsChange {
    pluginId: string
    values: PluginSettingValues
  }

  type PluginSettingWriteResult = { ok: true; values: PluginSettingValues } | { ok: false; error: string }

  interface PluginSettingsPageEntry {
    pluginId: string
    pluginName: string
    route: string
    label: string
    iconUrl: string | null
    topLevel: boolean
    exportName: string | null
    entry: string
    enabled: boolean
    settings: PluginSettingDeclaration[]
  }

  interface PluginSettingGroup {
    pluginId: string
    pluginName: string
    settings: PluginSettingDeclaration[]
  }

  interface PluginSettingRowsProps {
    pluginId: string
    settings: PluginSettingDeclaration[]
    wideControlStacked?: boolean
  }

  interface PluginSettingsPageProps {
    pluginId: string
  }

  interface PluginPageComponentProps {
    page: PluginSettingsPageEntry
    exportName: string
  }

  interface PluginPageBoundaryProps {
    id: string
    fallback: import('react').ReactNode
    children: import('react').ReactNode
  }

  type PluginComponentLoad =
    | { status: 'loading' }
    | { status: 'missing' }
    | { status: 'ready'; component: import('react').ComponentType }

  interface PluginsPageProps {
    onNavigate: (path: string) => void
  }

  interface InstalledPluginCardProps {
    plugin: PluginRecord
    settingsRoute: string | null
    removing: boolean
    onToggle: (plugin: PluginRecord) => void
    onUninstall: (plugin: PluginRecord) => void
    onNavigate: (path: string) => void
  }

  interface SettingsNavButtonProps {
    label: string
    active: boolean
    icon: import('react').ReactNode
    onClick: () => void
  }

  interface PluginPagesNavProps {
    pages: PluginSettingsPageEntry[]
    activeRoute: string | null
    onNavigate: (path: string) => void
  }

  interface PluginPageIconProps {
    page: PluginSettingsPageEntry
    active: boolean
  }

  interface SettingsBreadcrumbProps {
    path: string
    pluginPages: PluginSettingsPageEntry[]
    onNavigate: (path: string) => void
  }

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

  type TopbarItemId =
    | 'system-menu'
    | 'plugins-left'
    | 'notice'
    | 'launcher'
    | 'tray'
    | 'media'
    | 'microphone'
    | 'status'
    | 'plugins-right'
    | 'clock'

  type TopbarItemKind = 'element' | 'plugin-group'

  interface TopbarItemDefinition {
    id: TopbarItemId
    slot: TopbarSlot
    kind: TopbarItemKind
    label: string
  }

  interface TopbarLayoutItem {
    id: TopbarItemId
    slot: TopbarSlot
    order: number
    visible: boolean
  }

  interface StoredTopbarLayout {
    slots: Record<TopbarSlot, string[]>
    hidden: string[]
  }

  interface TopbarLayoutPatch {
    slots?: Partial<Record<TopbarSlot, string[]>>
    hidden?: string[]
  }

  interface TopbarWidgetContribution {
    type: 'topbar-widget'
    id: string
    component: import('react').ComponentType
    slot?: TopbarSlot
    order?: number
  }

  interface TopbarSurface {
    bg: string
    darkText: boolean
    borderColor: string
  }

  interface TopbarItemTarget {
    slot: TopbarSlot
    index: number
  }

  type TopbarStepDirection = 'earlier' | 'later'

  type TopbarGatedItemId = Extract<TopbarItemId, 'launcher' | 'tray'>

  type TopbarItemSettingGates = Readonly<Record<TopbarGatedItemId, string>>

  interface TopbarLayoutEditor {
    items: TopbarLayoutItem[]
    error: string | null
    commit(items: TopbarLayoutItem[]): Promise<boolean>
    reset(): Promise<boolean>
  }

  interface TopbarInteractiveZone {
    left: number
    right: number
  }

  type PowerAction = 'shutdown' | 'restart' | 'logout'

  type PowerMenuPress = { run: PowerAction } | { armed: PowerAction }

  interface SystemMenuFaceProps {
    darkText: boolean
  }

  interface SystemMenuActionsProps {
    darkText: boolean
    confirmRequired: boolean
  }

  interface NoticeFaceProps {
    notice: Pick<ShellNotice, 'title' | 'message' | 'tone' | 'busy'>
    darkText: boolean
  }

  interface LauncherFaceProps {
    darkText: boolean
  }

  type TrayFaceIcon = Pick<TrayIcon, 'id' | 'tooltip' | 'icon'>

  interface TrayFaceProps {
    icons: TrayFaceIcon[]
    showCaret: boolean
    darkText: boolean
  }

  interface TrayIconGlyphProps {
    src: string
  }

  interface TrayCaretGlyphProps {
    darkText: boolean
  }

  interface MusicBarsGlyphProps {
    peak: number
    color: string
  }

  interface MediaFaceProps {
    title: string
    appIcon: string | null
    peak: number
    darkText: boolean
  }

  interface MicrophoneFaceProps {
    apps: string[]
    darkText: boolean
  }

  interface StatusFaceProps {
    bluetooth: BluetoothState
    network: Pick<NetworkStatus, 'signal' | 'connected' | 'type'>
    radioOn: boolean
    battery: Pick<BatteryStatus, 'percent' | 'charging' | 'hasBattery'>
    darkText: boolean
  }

  interface ClockFaceProps {
    time: string
    date: string
    darkText: boolean
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
    usePluginSetting: <T extends PluginSettingValue = PluginSettingValue>(pluginId: string, key: string) => [T, (value: T) => void]
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

  interface KeyboardLayoutOption {
    id: string
    name: string
  }

  interface KeyboardInputMethod {
    tip: string
    localeId: string
    layoutId: string
    name: string
  }

  interface KeyboardLanguage {
    tag: string
    autonym: string
    name: string
    localeId: string | null
    layouts: KeyboardInputMethod[]
  }

  interface KeyboardLayoutState {
    languages: KeyboardLanguage[]
    defaultInputMethod: string | null
  }

  interface OptimisticKeyboardLayout {
    publishedWhenWritten: KeyboardLayoutState
    state: KeyboardLayoutState
  }

  interface KeyboardLanguageOption {
    tag: string
    name: string
    nativeName: string
  }

  interface KeyboardLanguageChangeResult {
    ok: boolean
    error: string | null
    state: KeyboardLayoutState
  }

  interface CalendarConnection {
    connected: boolean
    email: string | null
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

  type SettingsIcon = import('lucide-react').LucideIcon

  type SettingsApplies = 'instant' | 'confirm' | 'restart' | 'draft'

  type SettingsSectionId = 'home' | 'personalization' | 'devices' | 'system'

  type SettingsPageId =
    | 'home'
    | 'revert'
    | 'appearance'
    | 'wallpaper'
    | 'ridge'
    | 'search'
    | 'calendar'
    | 'input'
    | 'tray-icons'
    | 'tiling'
    | 'battery'
    | 'displays'
    | 'wifi'
    | 'bluetooth'
    | 'apps'
    | 'apps-installed'
    | 'apps-startup'
    | 'apps-running'
    | 'apps-defaults'
    | 'plugins'
    | 'updates'
    | 'quick-actions'

  type SettingsPageKind = 'settings' | 'hub' | 'manager' | 'launcher'

  interface SettingsSection {
    id: SettingsSectionId
    label: string
    icon: SettingsIcon
    order: number
  }

  interface SettingsPage {
    id: SettingsPageId
    route: string | null
    label: string
    description: string
    keywords: string[]
    icon: SettingsIcon
    section: SettingsSectionId | null
    kind: SettingsPageKind
    order: number
  }

  interface SettingsToggleControl {
    kind: 'toggle'
  }

  interface SettingsSliderControl {
    kind: 'slider'
    min: number
    max: number
    step: number
    unit?: string
  }

  interface SettingsSelectControl {
    kind: 'select'
    options: readonly import('@alpine/ui').SelectOption<string>[]
  }

  interface SettingsSegmentedControl {
    kind: 'segmented'
    options: readonly import('@alpine/ui').SelectOption<string | number>[]
  }

  interface SettingsColorControl {
    kind: 'color'
  }

  interface SettingsHotkeyControl {
    kind: 'hotkey'
    fallback: string
  }

  type SettingsValueControl =
    | SettingsToggleControl
    | SettingsSliderControl
    | SettingsSelectControl
    | SettingsSegmentedControl
    | SettingsColorControl
    | SettingsHotkeyControl

  type SettingsPanelControl =
    | { kind: 'navigate'; path: string }
    | { kind: 'action'; actionLabel: string; actionIcon: SettingsIcon; run(): Promise<unknown> }
    | { kind: 'brightness' }
    | { kind: 'wallpaper' }
    | { kind: 'wifi' }
    | { kind: 'bluetooth' }
    | { kind: 'tray' }
    | { kind: 'tiling' }
    | { kind: 'startup' }
    | { kind: 'power' }
    | { kind: 'emoji' }

  type SettingsControl = SettingsValueControl | SettingsPanelControl

  type SettingsValue = boolean | number | string | TopBarColor | null

  interface SettingsEntryBase {
    id: string
    label: string
    description: string
    hint?: string
    keywords: string[]
    icon: SettingsIcon
    page: SettingsPageId
    group: string
    order: number
    applies: SettingsApplies
  }

  interface SettingsValueEntry extends SettingsEntryBase {
    control: SettingsValueControl
    read(): Promise<SettingsValue>
    write(value: SettingsValue): Promise<unknown>
    subscribe?(listener: (value: SettingsValue) => void): (() => void) | void
    defaultValue: SettingsValue
    initial?(): SettingsValue
    validate?(value: unknown): SettingsValue
  }

  interface SettingsPanelEntry extends SettingsEntryBase {
    control: SettingsPanelControl
  }

  type SettingsEntry = SettingsValueEntry | SettingsPanelEntry

  interface SettingsValueSnapshot {
    value: SettingsValue
    staged: SettingsValue | undefined
    restartRequired: boolean
    error: string | null
  }

  interface SettingsValueBinding extends SettingsValueSnapshot {
    write(next: SettingsValue): void
    confirm(): void
    cancel(): void
  }

  interface SettingsPageSlot {
    group: string
    order: number
    replaces?: string[]
    content: import('react').ReactNode
  }

  interface RegistryPageProps {
    page: SettingsPageId
    slots?: SettingsPageSlot[]
    hidden?: string[]
    lead?: import('react').ReactNode
    groupSubtitles?: Record<string, string>
    entryDescriptions?: Record<string, string>
  }

  type SettingsSearchAction =
    | { kind: 'toggle'; entry: SettingsValueEntry }
    | { kind: 'navigate'; route: string; highlight: string | null }
    | { kind: 'launcher' }

  interface SettingsRouteCoverage {
    registryRows: boolean
    renderedByThePage: string[]
  }

  interface SettingsSearchTarget {
    id: string
    label: string
    description: string
    keywords: string[]
    icon: SettingsIcon
    context: string
    action: SettingsSearchAction
  }

  interface SettingsSearchMatch {
    target: SettingsSearchTarget
    score: number
  }

  interface SettingsSearchResultsProps {
    query: string
    matches: SettingsSearchMatch[]
    total: number
    selected: number
    listId: string
    rowId: (index: number) => string
    onPoint: (index: number) => void
    onActivate: (target: SettingsSearchTarget) => void
  }

  type SettingsRouteView = (navigate: (path: string) => void) => import('react').ReactNode

  interface HotkeyBindResult {
    ok: boolean
    hotkey: string
  }

  interface HotkeyRecorderProps {
    value: string
    fallback: string
    onChange: (hotkey: string) => void
    disabled?: boolean
  }

  type RidgeLayoutMode = 'strip' | 'stacked'

  type RidgeCalloutPlacement = 'below' | 'above'

  interface RidgeCalloutPlacementFor {
    id: TopbarItemId
    placement: RidgeCalloutPlacement
  }


  interface RidgeFitProps {
    children: import('react').ReactNode
  }

  interface RidgeFitMeasurement {
    width: number
    height: number
    floor: number
  }

  interface RidgeRgb {
    r: number
    g: number
    b: number
  }

  interface RidgeSwatchProps {
    label: string
    selected: boolean
    onClick: () => void
    background: string
    light: boolean
  }

  interface RidgePresetMenuProps {
    color: RidgeRgb | null
    onPick: (color: RidgeRgb) => void
  }

  interface RidgePresetColor {
    name: string
    color: RidgeRgb
  }

  interface RidgeLivePluginWidgetsProps {
    slot: RidgePluginSlot
    data: RidgePreviewData
    darkText: boolean
  }

  interface RidgePluginBoundaryProps {
    id: string
    children: import('react').ReactNode
  }

  type RidgePluginSlot = Exclude<TopbarSlot, 'center'>

  type RidgeVisibilityStep =
    | { kind: 'layout'; items: TopbarLayoutItem[] }
    | { kind: 'layout-reset' }
    | { kind: 'gate'; item: TopbarGatedItemId; visible: boolean }

  interface RidgeGates {
    visible: Record<TopbarGatedItemId, boolean>
    setGate(item: TopbarGatedItemId, visible: boolean): Promise<boolean>
  }

  interface RidgeEditor {
    layout: TopbarLayoutItem[]
    items: TopbarLayoutItem[]
    error: string | null
    isDefault: boolean
    commit(layout: TopbarLayoutItem[]): Promise<boolean>
    move(id: TopbarItemId, target: TopbarItemTarget): Promise<boolean>
    step(id: TopbarItemId, direction: TopbarStepDirection, isDrawn?: (id: TopbarItemId) => boolean): Promise<boolean>
    show(id: TopbarItemId): Promise<boolean>
    hide(id: TopbarItemId): Promise<boolean>
    reset(): Promise<boolean>
  }

  interface RidgePoint {
    x: number
    y: number
  }

  interface RidgeBox {
    left: number
    top: number
    right: number
    bottom: number
  }

  interface RidgeChipBox extends RidgeBox {
    id: TopbarItemId
  }

  interface RidgeLaneBox extends RidgeBox {
    slot: TopbarSlot
    chips: RidgeChipBox[]
  }

  interface RidgeDragGeometry {
    lanes: RidgeLaneBox[]
    hideZone: RidgeBox | null
  }

  type RidgeDropTarget =
    | { kind: 'lane'; slot: TopbarSlot; index: number }
    | { kind: 'hide' }
    | { kind: 'refused'; slot: TopbarSlot }

  interface RidgeDragSetup {
    measure: () => RidgeDragGeometry
    scrollContainer: () => HTMLElement | null
    ghost: import('react').RefObject<HTMLDivElement | null>
    caret: import('react').RefObject<HTMLDivElement | null>
    onLift(id: TopbarItemId): void
    onTarget(target: RidgeDropTarget | null): void
    onDrop(id: TopbarItemId, target: RidgeDropTarget | null): void
    onCancel(): void
  }

  interface RidgeDragControls {
    start(event: import('react').PointerEvent<HTMLElement>, id: TopbarItemId): void
    takeSuppressedClick(): boolean
  }

  interface RidgeDragSession {
    id: TopbarItemId
    element: HTMLElement
    origin: RidgePoint
    grabOffset: RidgePoint
    pointer: RidgePoint
    active: boolean
    geometry: RidgeDragGeometry | null
    target: RidgeDropTarget | null
    scroller: HTMLElement | null
    scrollTimer: number | null
  }

  type RidgeKeyStep = 'earlier' | 'later' | 'first' | 'last'

  type RidgeKeyIntent =
    | { kind: 'grab' }
    | { kind: 'drop' }
    | { kind: 'cancel' }
    | { kind: 'hide' }
    | { kind: 'focus'; step: RidgeKeyStep }
    | { kind: 'move'; step: RidgeKeyStep }
    | { kind: 'native' }

  interface RidgeClockPreviewData {
    now: Date
    prefs: ClockPrefs
  }

  interface RidgeStatusPreviewData {
    battery: BatteryStatus
    bluetooth: BluetoothState
    network: NetworkStatus
  }

  interface RidgeMediaPreviewData {
    playback: MediaPlayback
    showVisualizer: boolean
  }

  interface RidgeTrayPreviewData {
    visible: TrayIcon[]
    overflow: TrayIcon[]
    showOverflow: boolean
  }

  interface RidgePluginWidget {
    id: string
    pluginId: string
    pluginName: string
    pluginIcon: string | null
    pluginSettings: PluginSettingDeclaration[]
    slot: RidgePluginSlot
    order: number
  }

  interface RidgePreviewData {
    color: TopBarColor | null
    clock: RidgeClockPreviewData
    status: RidgeStatusPreviewData
    media: RidgeMediaPreviewData
    microphone: MicrophoneStatus
    tray: RidgeTrayPreviewData
    plugins: Record<RidgePluginSlot, RidgePluginWidget[]>
  }

  interface RidgeItemPreviewProps {
    data: RidgePreviewData
    darkText: boolean
  }

  type RidgeItemPreview = import('react').ComponentType<RidgeItemPreviewProps>

  interface RidgePluginGroupFaceProps {
    widgets: RidgePluginWidget[]
    darkText: boolean
  }

  interface RidgeItemLink {
    label: string
    page: SettingsPageId
    detail?(data: RidgePreviewData): string | null
  }

  interface RidgeItemDetail {
    entries: string[]
    links: RidgeItemLink[]
    note(data: RidgePreviewData): string | null
  }

  interface RidgeCanvasHandle {
    focusItem(id: TopbarItemId): void
    abandonGrab(): void
    announce(message: string): void
  }

  interface RidgeCanvasProps {
    editor: RidgeEditor
    previewData: RidgePreviewData
    openItem: TopbarItemId | null
    onOpenItemChange: (id: TopbarItemId | null) => void
    onNothingLeftToFocus: () => void
    renderCallout: (id: TopbarItemId) => import('react').ReactNode
    measure?: () => RidgeDragGeometry
    scrollContainer?: () => HTMLElement | null
    ref?: import('react').Ref<RidgeCanvasHandle>
  }

  interface RidgeStripProps {
    surface: TopbarSurface
    lanes: Record<TopbarSlot, import('react').ReactNode>
    ref?: import('react').Ref<HTMLDivElement>
  }

  type RidgeLaneDropState = 'idle' | 'accept' | 'refuse'

  interface RidgeLaneProps {
    slot: TopbarSlot
    label: string
    mode: RidgeLayoutMode
    surface: TopbarSurface
    dropState?: RidgeLaneDropState
    moving?: boolean
    children?: import('react').ReactNode
    ref?: import('react').Ref<HTMLDivElement>
  }

  interface RidgeChipProps {
    id: TopbarItemId
    label: string
    darkText: boolean
    tabbable: boolean
    expanded: boolean
    grabbed: boolean
    controls?: string
    lifted?: boolean
    sample?: boolean
    describedBy?: string
    onClick: () => void
    onKeyDown?: (event: import('react').KeyboardEvent<HTMLButtonElement>) => void
    onKeyUp?: (event: import('react').KeyboardEvent<HTMLButtonElement>) => void
    onPointerDown?: (event: import('react').PointerEvent<HTMLButtonElement>) => void
    onFocus?: () => void
    children: import('react').ReactNode
    ref?: import('react').Ref<HTMLButtonElement>
  }

  interface RidgeDragLayerProps {
    surface: TopbarSurface
    ghost: import('react').ReactNode | null
    ghostRef?: import('react').Ref<HTMLDivElement>
    caretRef?: import('react').Ref<HTMLDivElement>
  }

  interface RidgeHideZoneProps {
    active: boolean
    targeted: boolean
    ref?: import('react').Ref<HTMLDivElement>
  }

  interface RidgeAnnouncerProps {
    message: string
  }

  interface RidgeCalloutFrameProps {
    id: string
    mode: RidgeLayoutMode
    children: import('react').ReactNode
    ref?: import('react').Ref<HTMLDivElement>
    leaderRef?: import('react').Ref<SVGPathElement>
  }

  interface RidgeCalloutProps {
    item: TopbarLayoutItem
    previewData: RidgePreviewData
    highlightedSetting: string | null
    canStepEarlier: boolean
    canStepLater: boolean
    onStep: (direction: TopbarStepDirection) => void
    onHide: () => void
    onNavigate: (path: string) => void
    onClose: () => void
  }

  interface RidgeAddMenuProps {
    id?: string
    items: TopbarItemId[]
    previewData: RidgePreviewData
    onSelect: (id: TopbarItemId) => void
    onDismiss: () => void
  }

  interface RidgeHiddenItemNoticeProps {
    item: TopbarItemId
    onAdd: () => void
    onClose: () => void
  }

  interface RidgePageProps {
    onNavigate: (path: string) => void
    initialItem?: TopbarItemId
  }

  interface AppearancePageProps {
    onNavigate: (path: string) => void
  }

  type LauncherResultKind = 'open' | 'app' | 'tab' | 'bookmark' | 'setting' | 'wincmd'

  interface LauncherMemory {
    usage: Record<string, number>
    queries: Record<string, Record<string, number>>
  }

  interface RankCandidate {
    kind: LauncherResultKind
    key: string
    match: number
  }

  interface Window {
    alpineBoot?: AlpineBootState
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
      settings: {
        get: (pluginId: string) => Promise<PluginSettingValues>
        set: (pluginId: string, key: string, value: PluginSettingValue) => Promise<PluginSettingWriteResult>
        onChanged: (callback: (change: PluginSettingsChange) => void) => () => void
      }
    }
    alpine?: AlpinePluginRuntime
    setup: {
      status: () => Promise<SetupStatus>
      install: (options: SetupOptions) => Promise<SetupResult>
      skip: () => Promise<SetupGateResult>
      testOut: () => Promise<SetupGateResult>
      relaunch: () => Promise<void>
      restartWindows: () => Promise<void>
      revertTemporary: () => Promise<RevertResult>
      revertPermanent: () => Promise<RevertResult>
      setShell: () => Promise<SetupShellResult>
      uninstall: () => Promise<RevertResult>
      fitWindowHeight: (height: number) => void
      onProgress: (callback: (step: string) => void) => void
    }
    licence: {
      status: () => Promise<LicenceStatus>
      defaultDeviceName: () => Promise<string>
      signIn: (options?: LicenceSignInOptions) => Promise<LicenceSignInProgress>
      signInState: () => Promise<LicenceSignInProgress>
      cancelSignIn: () => Promise<LicenceSignInProgress>
      activate: (options?: LicenceActivateOptions) => Promise<LicenceActivationOutcome>
      openCheckout: () => Promise<void>
      openAccount: () => Promise<void>
      release: () => Promise<LicenceStatus>
      onSignInProgress: (callback: (progress: LicenceSignInProgress) => void) => () => void
      onChanged: (callback: (status: LicenceStatus) => void) => () => void
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
      setHotkey: (hotkey: string) => Promise<HotkeyBindResult>
      defaultHotkey: () => Promise<string>
      onHotkeyChanged: (callback: (hotkey: string) => void) => () => void
      onShow: (callback: (data: { displayId: number; mode?: string }) => void) => void
      onStartClose: (callback: () => void) => () => void
      onHide: (callback: () => void) => () => void
      scores: () => Promise<LauncherMemory>
      recordSelection: (key: string, query: string) => Promise<boolean>
      onScoresChanged: (callback: (data: LauncherMemory) => void) => () => void
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
      setActiveRegion: (region: TopbarActiveRegion | null) => void
      setInteractiveZones: (zones: TopbarInteractiveZone[]) => void
      color: () => Promise<TopBarColor | null>
      onColorChanged: (callback: (color: TopBarColor) => void) => () => void
      colorOverride: () => Promise<TopBarColor | null>
      setColorOverride: (color: { r: number; g: number; b: number } | null) => Promise<TopBarColor | null>
      colorPalette: () => Promise<TopBarColor[]>
      adaptToApps: () => Promise<boolean>
      setAdaptToApps: (value: boolean) => Promise<boolean>
      onAdaptToAppsChanged: (callback: (value: boolean) => void) => () => void
      searchIcon: () => Promise<boolean>
      setSearchIcon: (value: boolean) => Promise<boolean>
      onSearchIconChanged: (callback: (visible: boolean) => void) => () => void
      mediaVisualizer: () => Promise<boolean>
      setMediaVisualizer: (value: boolean) => Promise<boolean>
      onMediaVisualizerChanged: (callback: (value: boolean) => void) => () => void
      foregroundColor: () => Promise<ForegroundColorData[]>
      onForegroundColorChanged: (callback: (data: ForegroundColorBroadcast) => void) => () => void
      windowCoverage: () => Promise<DisplayWindowCoverage[]>
      onWindowCoverageChanged: (callback: (coverage: DisplayWindowCoverage[]) => void) => () => void
      onCloseMenus: (callback: () => void) => () => void
      layout: () => Promise<StoredTopbarLayout>
      setLayout: (layout: TopbarLayoutPatch) => Promise<StoredTopbarLayout>
      onLayoutChanged: (callback: (layout: StoredTopbarLayout) => void) => () => void
      initialLayout: StoredTopbarLayout | null
    }
    shell: {
      settingsIcon: string
      theme: {
        initial: ThemeState
        get: () => Promise<ThemeState>
        onChanged: (callback: (theme: ThemeState) => void) => () => void
      }
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
        onWifiSignalChanged: (callback: (data: NetworkStatus) => void) => () => void
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
        bluetoothRefresh: () => Promise<BluetoothState>
        bluetoothConnect: (deviceId: string) => Promise<BluetoothActionResult>
        bluetoothDisconnect: (deviceId: string) => Promise<BluetoothActionResult>
        bluetoothRemove: (deviceId: string) => Promise<BluetoothActionResult>
        bluetoothRepairAudio: (deviceId: string) => Promise<BluetoothActionResult>
        bluetoothOpenSettings: () => Promise<BluetoothActionResult>
        bluetoothSetRadio: (enabled: boolean) => Promise<BluetoothActionResult>
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
        powerAction: (action: PowerAction) => Promise<void>
        powerConfirm: () => Promise<boolean>
        setPowerConfirm: (value: boolean) => Promise<boolean>
        onPowerConfirmChanged: (callback: (value: boolean) => void) => () => void
        onResume: (callback: () => void) => () => void
        info: () => Promise<SystemInfo>
        battery: () => Promise<BatteryStatus>
        onBatteryChanged: (callback: (data: BatteryStatus) => void) => () => void
      }
      batterySaver: {
        config: () => Promise<BatterySaverConfig>
        setConfig: (partial: Partial<BatterySaverConfig>) => Promise<BatterySaverConfig>
        onConfigChanged: (callback: (config: BatterySaverConfig) => void) => () => void
        state: () => Promise<BatterySaverState>
        setOverride: (override: BatterySaverOverride) => Promise<BatterySaverState>
        onStateChanged: (callback: (state: BatterySaverState) => void) => () => void
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
        onIconsChanged: (callback: (data: TrayIcon[]) => void) => () => void
        click: (id: string, button: 'left' | 'right', x: number, y: number) => Promise<void>
        layout: () => Promise<TrayLayout>
        setLayout: (layout: TrayLayout) => Promise<TrayLayout>
        onLayoutChanged: (callback: (data: TrayLayout) => void) => () => void
        display: () => Promise<TrayDisplaySetting>
        setDisplay: (showOnAllMonitors: boolean) => Promise<TrayDisplaySetting>
        onDisplayChanged: (callback: (data: TrayDisplaySetting) => void) => () => void
        settings: () => Promise<TraySettings>
        setSettings: (partial: Partial<TraySettings>) => Promise<TraySettings>
        onSettingsChanged: (callback: (data: TraySettings) => void) => () => void
      }
      updates: {
        getState: () => Promise<UpdateState>
        getLog: () => Promise<UpdateLogEntry[]>
        check: () => Promise<UpdateState>
        download: () => Promise<void>
        install: () => Promise<void>
        preferences: () => Promise<UpdatePreferences>
        setPreferences: (partial: Partial<UpdatePreferences>) => Promise<UpdatePreferences>
        onStateChanged: (callback: (state: UpdateState) => void) => void
        onLogChanged: (callback: (entries: UpdateLogEntry[]) => void) => void
        onPreferencesChanged: (callback: (preferences: UpdatePreferences) => void) => () => void
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
      keyboard: {
        availableLayouts: () => Promise<KeyboardLayoutOption[]>
        languages: () => Promise<KeyboardLanguage[]>
        availableLanguages: () => Promise<KeyboardLanguageOption[]>
        addLanguage: (tag: string) => Promise<KeyboardLanguageChangeResult>
        removeLanguage: (tag: string) => Promise<KeyboardLanguageChangeResult>
        addLayout: (tag: string, layoutId: string) => Promise<KeyboardLayoutState>
        removeLayout: (tag: string, tip: string) => Promise<KeyboardLayoutState>
        reorderLayouts: (tag: string, tips: string[]) => Promise<KeyboardLayoutState>
        defaultInputMethod: () => Promise<string | null>
        setDefaultInputMethod: (tip: string | null) => Promise<KeyboardLayoutState>
        activateNow: (tip: string) => Promise<{ ok: boolean }>
        onChanged: (callback: (state: KeyboardLayoutState) => void) => () => void
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
