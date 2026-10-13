import { settingsEntry } from "../../../../settings/registry"
import { BluetoothView } from "./bluetoothView"
import { BrightnessView } from "./brightnessView"
import { PowerView } from "./powerView"
import { StartupView } from "./startupView"
import { TilingView } from "./tilingView"
import { TrayView } from "./trayView"
import { WifiView } from "./wifiView"

interface SettingViewProps {
  settingId: string
  darkText: boolean
  onBack: () => void
  onTitleChange: (title: string | null) => void
}

export function SettingView({ settingId, darkText, onBack, onTitleChange }: SettingViewProps) {
  const kind = settingsEntry(settingId)?.control.kind
  if (kind === "wifi") return <WifiView darkText={darkText} onBack={onBack} />
  if (kind === "bluetooth") return <BluetoothView darkText={darkText} onBack={onBack} />
  if (kind === "brightness") return <BrightnessView darkText={darkText} onBack={onBack} />
  if (kind === "tiling") return <TilingView darkText={darkText} onBack={onBack} />
  if (kind === "startup") return <StartupView darkText={darkText} onBack={onBack} />
  if (kind === "tray") return <TrayView darkText={darkText} onBack={onBack} onTitleChange={onTitleChange} />
  if (kind === "power") return <PowerView darkText={darkText} onBack={onBack} />
  return null
}
