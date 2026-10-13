import { useEffect, useState } from "react"
import { LayoutDashboard, RotateCcw } from "lucide-react"
import { LauncherMenu } from "./launcherMenu"

function tilingItems(config: TilingConfig, patch: (changes: Partial<TilingConfig>) => void): LauncherMenuItem[] {
  const items: LauncherMenuItem[] = [
    { id: "enabled", kind: "toggle", label: "Window tiling", icon: LayoutDashboard, value: config.enabled, onToggle: () => patch({ enabled: !config.enabled }), dividerAfter: config.enabled },
  ]
  if (!config.enabled) return items
  items.push({ id: "mode", kind: "select", label: "Mode", icon: LayoutDashboard, value: config.mode, options: [{ value: "snap", label: "Snap zones" }, { value: "dynamic", label: "Auto-tile" }], onChange: (value) => patch({ mode: value as TilingMode }) })
  items.push({ id: "hotkeys", kind: "toggle", label: "Win + Arrow snapping", icon: LayoutDashboard, value: config.hotkeys, onToggle: () => patch({ hotkeys: !config.hotkeys }) })
  items.push({ id: "drag", kind: "toggle", label: "Drag to zone", icon: LayoutDashboard, value: config.dragToZone, onToggle: () => patch({ dragToZone: !config.dragToZone }) })
  if (config.mode === "dynamic") {
    items.push({ id: "layout", kind: "select", label: "Layout", icon: LayoutDashboard, value: config.dynamicLayout, options: [{ value: "bsp", label: "Spiral" }, { value: "columns", label: "Columns" }, { value: "master-stack", label: "Master + stack" }], onChange: (value) => patch({ dynamicLayout: value as TilingDynamicLayout }) })
  }
  items.push({ id: "gap", kind: "slider", label: "Gap", icon: LayoutDashboard, value: config.gap, min: 0, max: 40, step: 2, unit: "px", onChange: (value) => patch({ gap: value }) })
  items.push({ id: "margin", kind: "slider", label: "Outer margin", icon: LayoutDashboard, value: config.margin, min: 0, max: 60, step: 2, unit: "px", onChange: (value) => patch({ margin: value }) })
  items.push({ id: "oversized", kind: "toggle", label: "Keep oversized on screen", icon: LayoutDashboard, value: config.handleOversized, onToggle: () => patch({ handleOversized: !config.handleOversized }) })
  if (config.handleOversized) {
    items.push({ id: "placement", kind: "select", label: "Placement", icon: LayoutDashboard, value: config.centerOversized ? "center" : "edge", options: [{ value: "edge", label: "Edge" }, { value: "center", label: "Center" }], onChange: (value) => patch({ centerOversized: value === "center" }) })
  }
  items.push({ id: "reset", kind: "action", label: "Reset split sizes", icon: RotateCcw, onRun: () => patch({ ratios: {} }) })
  return items
}

export function TilingView({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const [config, setConfig] = useState<TilingConfig | null>(null)

  useEffect(() => {
    window.shell.tiling.config().then(setConfig).catch(() => {})
    return window.shell.tiling.onConfigChanged(setConfig)
  }, [])

  function patch(changes: Partial<TilingConfig>) {
    setConfig((current) => (current ? { ...current, ...changes } : current))
    window.shell.tiling.setConfig(changes).catch(() => {})
  }

  return <LauncherMenu items={config ? tilingItems(config, patch) : []} darkText={darkText} onBack={onBack} />
}
