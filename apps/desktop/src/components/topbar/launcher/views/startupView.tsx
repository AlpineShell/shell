import { useEffect, useState } from "react"
import { LauncherMenu } from "./launcherMenu"

function isEnabled(entry: StartupEntry): boolean {
  return entry.pending !== null ? entry.pending === "enable" : entry.enabled
}

export function StartupView({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const [entries, setEntries] = useState<StartupEntry[]>([])

  useEffect(() => {
    window.shell.apps.startup().then(setEntries).catch(() => {})
    return window.shell.apps.onStartupChanged(setEntries)
  }, [])

  function toggle(entry: StartupEntry) {
    if (entry.locked) return
    window.shell.apps.setStartup(entry.id, !isEnabled(entry)).then(setEntries).catch(() => {})
  }

  const items: LauncherMenuItem[] = entries.map((entry) => ({
    id: entry.id,
    kind: "toggle",
    label: entry.friendlyName || entry.name,
    iconSrc: entry.icon,
    value: isEnabled(entry),
    onToggle: () => toggle(entry),
  }))

  return <LauncherMenu items={items} darkText={darkText} onBack={onBack} />
}
