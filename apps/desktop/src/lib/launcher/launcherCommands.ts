import { Camera, Lock, LogOut, Maximize2, Minimize2, Moon, Power, RotateCcw, SquareStack, Layers, X } from "lucide-react"
import { windowCommandResultKey } from "../launcherRanking"

function commandKey(id: string): string {
  return `command:${id}`
}

export const LAUNCHER_COMMANDS: readonly LauncherCommand[] = [
  {
    id: "minimize-window",
    rankKey: windowCommandResultKey("minimize"),
    label: "Minimize this window",
    keywords: ["minimize", "min", "hide window"],
    icon: Minimize2,
    run: { kind: "window-command", action: "minimize" },
  },
  {
    id: "maximize-window",
    rankKey: windowCommandResultKey("maximize"),
    label: "Maximize this window",
    keywords: ["maximize", "max", "fullscreen", "full screen"],
    icon: Maximize2,
    run: { kind: "window-command", action: "maximize" },
  },
  {
    id: "close-window",
    rankKey: windowCommandResultKey("close"),
    label: "Close this window",
    keywords: ["close", "close window", "quit", "exit"],
    icon: X,
    run: { kind: "window-command", action: "close" },
  },
  {
    id: "minimize-all",
    rankKey: commandKey("minimize-all"),
    label: "Minimize all windows",
    keywords: ["minimize all", "show desktop", "hide all windows", "clear screen"],
    icon: SquareStack,
    run: { kind: "minimize-all" },
  },
  {
    id: "restore-windows",
    rankKey: commandKey("restore-windows"),
    label: "Restore minimized windows",
    keywords: ["restore windows", "bring windows back", "unminimize"],
    icon: Layers,
    run: { kind: "restore-minimized" },
  },
  {
    id: "lock",
    rankKey: commandKey("lock"),
    label: "Lock",
    keywords: ["lock screen", "lock computer", "lock pc"],
    icon: Lock,
    run: { kind: "power", action: "lock", confirm: false },
  },
  {
    id: "sleep",
    rankKey: commandKey("sleep"),
    label: "Sleep",
    keywords: ["sleep", "suspend", "standby"],
    icon: Moon,
    run: { kind: "power", action: "sleep", confirm: false },
  },
  {
    id: "shutdown",
    rankKey: commandKey("shutdown"),
    label: "Shut down",
    keywords: ["shutdown", "shut down", "turn off", "power off"],
    icon: Power,
    run: { kind: "power", action: "shutdown", confirm: true },
  },
  {
    id: "restart",
    rankKey: commandKey("restart"),
    label: "Restart",
    keywords: ["restart", "reboot"],
    icon: RotateCcw,
    run: { kind: "power", action: "restart", confirm: true },
  },
  {
    id: "logout",
    rankKey: commandKey("logout"),
    label: "Log out",
    keywords: ["log out", "logout", "sign out", "log off"],
    icon: LogOut,
    run: { kind: "power", action: "logout", confirm: true },
  },
  {
    id: "screenshot",
    rankKey: commandKey("screenshot"),
    label: "Take a screenshot",
    keywords: ["screenshot", "screen capture", "snip", "capture screen"],
    icon: Camera,
    run: { kind: "screenshot" },
  },
]
