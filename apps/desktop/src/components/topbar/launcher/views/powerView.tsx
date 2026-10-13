import { useState } from "react"
import { Lock, LogOut, Moon, Power, RotateCcw } from "lucide-react"
import { usePowerConfirm } from "../../../../hooks/usePowerConfirm"
import { LauncherMenu } from "./launcherMenu"

const POWER_ACTIONS: { id: PowerCommandAction; label: string; icon: SettingsIcon; confirm: boolean }[] = [
  { id: "lock", label: "Lock", icon: Lock, confirm: false },
  { id: "sleep", label: "Sleep", icon: Moon, confirm: false },
  { id: "shutdown", label: "Shut down", icon: Power, confirm: true },
  { id: "restart", label: "Restart", icon: RotateCcw, confirm: true },
  { id: "logout", label: "Log out", icon: LogOut, confirm: true },
]

export function PowerView({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const [armed, setArmed] = useState<PowerCommandAction | null>(null)
  const confirmActions = usePowerConfirm()

  function run(action: PowerCommandAction) {
    window.launcher.hide()
    window.shell.system.powerAction(action)
  }

  const items: LauncherMenuItem[] = POWER_ACTIONS.map((power) => ({
    id: power.id,
    kind: "action",
    label: armed === power.id ? `Confirm ${power.label.toLowerCase()}` : power.label,
    icon: power.icon,
    onRun: () => {
      if (power.confirm && confirmActions && armed !== power.id) setArmed(power.id)
      else run(power.id)
    },
  }))

  return <LauncherMenu items={items} darkText={darkText} onBack={onBack} onSelectionChange={(item) => { if (!item || item.id !== armed) setArmed(null) }} />
}
