import { Monitor } from "lucide-react"
import { useMonitors } from "../../../../hooks/useMonitors"
import { monitorBrightnessLabel } from "../../../../lib/brightnessPresentation"
import { LauncherMenu } from "./launcherMenu"

export function BrightnessView({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const { monitors, setBrightness } = useMonitors()
  const items: LauncherMenuItem[] = monitors.map((monitor) => ({
    id: monitor.id,
    kind: "slider",
    label: monitorBrightnessLabel(monitor),
    icon: Monitor,
    value: monitor.brightness,
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
    onChange: (value: number) => setBrightness(monitor.id, value),
  }))
  return <LauncherMenu items={items} darkText={darkText} onBack={onBack} emptyText="No displays with brightness control" />
}
