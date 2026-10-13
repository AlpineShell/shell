import { useEffect, useState } from "react"
import { ChevronUp, LayoutGrid, Monitor } from "lucide-react"
import { LauncherMenu } from "./launcherMenu"

const TRAY_ICONS_TITLE = "Tray icons"

interface TrayViewProps {
  darkText: boolean
  onBack: () => void
  onTitleChange: (title: string | null) => void
}

export function TrayView({ darkText, onBack, onTitleChange }: TrayViewProps) {
  const [settings, setSettings] = useState<TraySettings | null>(null)
  const [display, setDisplay] = useState<TrayDisplaySetting | null>(null)
  const [icons, setIcons] = useState<TrayIcon[]>([])
  const [layout, setLayout] = useState<TrayLayout | null>(null)
  const [showingIcons, setShowingIcons] = useState(false)

  useEffect(() => {
    window.shell.tray.settings().then(setSettings).catch(() => {})
    window.shell.tray.display().then(setDisplay).catch(() => {})
    window.shell.tray.icons().then(setIcons).catch(() => {})
    window.shell.tray.layout().then(setLayout).catch(() => {})
  }, [])

  useEffect(() => () => onTitleChange(null), [onTitleChange])

  function patchSettings(changes: Partial<TraySettings>) {
    setSettings((current) => (current ? { ...current, ...changes } : current))
    window.shell.tray.setSettings(changes).then(setSettings).catch(() => {})
  }

  function toggleAllMonitors() {
    const next = !display?.showOnAllMonitors
    setDisplay((current) => (current ? { ...current, showOnAllMonitors: next } : current))
    window.shell.tray.setDisplay(next).then(setDisplay).catch(() => {})
  }

  function toggleIcon(icon: TrayIcon) {
    if (!layout) return
    const hidden = layout.hidden.includes(icon.id)
    const next = { ...layout, hidden: hidden ? layout.hidden.filter((id) => id !== icon.id) : [...layout.hidden, icon.id] }
    setLayout(next)
    window.shell.tray.setLayout(next).then(setLayout).catch(() => {})
  }

  function showMain() {
    setShowingIcons(false)
    onTitleChange(null)
  }

  function showIcons() {
    setShowingIcons(true)
    onTitleChange(TRAY_ICONS_TITLE)
  }

  if (showingIcons) {
    const items: LauncherMenuItem[] = icons.map((icon) => ({
      id: icon.id,
      kind: "toggle",
      label: icon.tooltip || "Tray icon",
      iconSrc: icon.icon,
      value: !(layout?.hidden ?? []).includes(icon.id),
      onToggle: () => toggleIcon(icon),
    }))
    return <LauncherMenu key="icons" items={items} emptyText="No system tray icons at the moment" darkText={darkText} onBack={showMain} />
  }

  const items: LauncherMenuItem[] = []
  if (settings) {
    items.push({ id: "enabled", kind: "toggle", label: "System tray", icon: LayoutGrid, value: settings.enabled, onToggle: () => patchSettings({ enabled: !settings.enabled }), dividerAfter: settings.enabled })
    if (settings.enabled) {
      items.push({ id: "overflow", kind: "toggle", label: "Show overflow arrow", icon: ChevronUp, value: settings.showOverflow, onToggle: () => patchSettings({ showOverflow: !settings.showOverflow }) })
      items.push({ id: "monitors", kind: "toggle", label: "Show on all monitors", icon: Monitor, value: !!display?.showOnAllMonitors, onToggle: toggleAllMonitors })
      items.push({ id: "icons", kind: "submenu", label: TRAY_ICONS_TITLE, icon: LayoutGrid, onOpen: showIcons })
    }
  }
  return <LauncherMenu key="main" items={items} darkText={darkText} onBack={onBack} />
}
