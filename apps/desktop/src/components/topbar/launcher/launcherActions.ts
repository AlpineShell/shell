import {
  AppWindow,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  Link,
  Minimize2,
  Play,
  Settings2,
  ShieldCheck,
  SkullIcon,
  SquarePlus,
  Terminal,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react"
import { isSettingsValueEntry, settingsPageRoute } from "../../../settings/registry"
import { writeSettingsValue } from "../../../hooks/useSettingsValue"
import { ALPINE_SETTINGS_TARGET, isAlpineSettingsItem } from "../../../lib/launcher/launcherEntries"

const WEB_SEARCH_URL = "https://www.google.com/search?q="
const VIEW_CONTROL_KINDS = new Set<SettingsControl["kind"]>(["brightness", "wifi", "bluetooth", "tray", "tiling", "startup", "power"])
export const ARM_ACTION_ID = "arm"

function action(id: string, label: string, icon: SettingsIcon, run: () => void): LauncherAction {
  return { id, label, icon, shortcut: null, run }
}

function withShortcuts(actions: LauncherAction[]): LauncherAction[] {
  return actions.map((entry, index) => ({ ...entry, shortcut: index === 0 ? "enter" : index === 1 ? "ctrl-enter" : null }))
}

function hideLauncher() {
  window.launcher.hide()
}

function copyAndHide(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
  hideLauncher()
}

function launchApp(item: LauncherItem) {
  if (isAlpineSettingsItem(item)) {
    window.shell.windows.openSettings()
    hideLauncher()
    return
  }
  window.launcher.launch(item.id)
}

function windowActions(app: OpenApp, launchItem: LauncherItem | null): LauncherAction[] {
  const isSettingsWindow = app.path === ALPINE_SETTINGS_TARGET
  const actions = [action("switch", "Switch to window", AppWindow, () => { window.shell.windows.activate(app.hwnd); hideLauncher() })]
  if (launchItem) actions.push(action("new-window", "Open new window", SquarePlus, () => launchApp(launchItem)))
  actions.push(action("minimize", "Minimize", Minimize2, () => { window.shell.windows.minimize(app.hwnd); hideLauncher() }))
  actions.push(action("close", "Close window", X, () => {
    if (isSettingsWindow) window.shell.windows.closeSettings()
    else window.shell.windows.close(app.hwnd)
    hideLauncher()
  }))
  if (!isSettingsWindow) actions.push(action("end-task", "End task", SkullIcon, () => { window.launcher.endTask(app.id) }))
  return actions
}

function tabActions(tab: BrowserTab): LauncherAction[] {
  return [action("switch", "Switch to tab", AppWindow, () => {
    window.shell.browserTabs.activate(tab).catch(() => {})
    window.shell.windows.activate(tab.hwnd)
    hideLauncher()
  })]
}

function appActions(item: LauncherItem, context: LauncherActionContext): LauncherAction[] {
  const open = action("open", "Open", ExternalLink, () => launchApp(item))
  if (isAlpineSettingsItem(item)) return [open]
  const actions = [open, action("admin", "Run as administrator", ShieldCheck, () => { window.launcher.launchAdmin(item.id) })]
  if (item.lnkPath) actions.push(action("location", "Open file location", FolderOpen, () => { window.launcher.openLocation(item.id); hideLauncher() }))
  actions.push(action("uninstall", "Uninstall", Trash2, () => context.uninstall(item)))
  return actions
}

function bookmarkActions(bookmark: Bookmark): LauncherAction[] {
  return [
    action("open", "Open", Globe, () => { window.shell.bookmarks.open(bookmark.url); hideLauncher() }),
    action("copy", "Copy link", Link, () => copyAndHide(bookmark.url)),
  ]
}

function openSettingsPageAction(setting: SettingsEntry): LauncherAction | null {
  const route = settingsPageRoute(setting.page)
  if (!route) return null
  return action("open-settings", "Open in Settings", Settings2, () => { window.shell.windows.openSettings(route); hideLauncher() })
}

export function opensView(setting: SettingsEntry): boolean {
  const kind = setting.control.kind
  return VIEW_CONTROL_KINDS.has(kind) || kind === "wallpaper" || kind === "emoji" || kind === "clipboard"
}

function settingPrimaryAction(setting: SettingsEntry, context: LauncherActionContext): LauncherAction | null {
  const control = setting.control
  if (control.kind === "toggle" && isSettingsValueEntry(setting) && setting.applies === "instant") {
    const on = context.settingValues[setting.id] === true
    return action("toggle", on ? "Turn off" : "Turn on", ToggleRight, () => { writeSettingsValue(setting, !on) })
  }
  if (VIEW_CONTROL_KINDS.has(control.kind)) {
    return action("open-view", "Open", ChevronRight, () => context.enterView({ kind: "setting", settingId: setting.id, title: setting.label }))
  }
  if (control.kind === "wallpaper") return action("open-view", "Choose wallpaper", ChevronRight, () => context.enterView({ kind: "wallpaper" }))
  if (control.kind === "emoji") return action("open-view", "Pick emoji", ChevronRight, () => context.enterView({ kind: "emoji", insertIntoForeground: false }))
  if (control.kind === "clipboard") return action("open-view", "Open clipboard history", ChevronRight, () => context.enterView({ kind: "clipboard" }))
  if (control.kind === "navigate") {
    return action("open", "Open", Settings2, () => { window.shell.windows.openSettings(control.path); hideLauncher() })
  }
  return null
}

function settingActions(setting: SettingsEntry, context: LauncherActionContext): LauncherAction[] {
  const primary = settingPrimaryAction(setting, context)
  const openPage = openSettingsPageAction(setting)
  if (!primary) return openPage ? [openPage] : []
  if (!openPage || setting.control.kind === "navigate") return [primary]
  return [primary, openPage]
}

function runCommand(run: LauncherCommandRun) {
  if (run.kind === "window-command") {
    window.shell.apps.windowCommand(run.action)
    return
  }
  if (run.kind === "screenshot") {
    window.launcher.takeScreenshot()
    return
  }
  hideLauncher()
  if (run.kind === "power") window.shell.system.powerAction(run.action)
  else if (run.kind === "minimize-all") window.shell.windows.minimizeAll()
  else window.shell.windows.restoreMinimized()
}

function needsConfirmation(command: LauncherCommand, context: LauncherActionContext): boolean {
  return command.run.kind === "power" && command.run.confirm && context.powerConfirm && context.armedCommandId !== command.id
}

export function commandLabel(command: LauncherCommand, armedCommandId: string | null): string {
  return armedCommandId === command.id ? `Confirm ${command.label.toLowerCase()}` : command.label
}

function commandActions(command: LauncherCommand, context: LauncherActionContext): LauncherAction[] {
  if (needsConfirmation(command, context)) return [action(ARM_ACTION_ID, command.label, command.icon, () => context.arm(command.id))]
  return [action("run", commandLabel(command, context.armedCommandId), command.icon, () => runCommand(command.run))]
}

function runActions(query: string, run: RunResult): LauncherAction[] {
  const exec = action("run", run.label, run.runInTerminal ? Terminal : Play, () => {
    if (run.runInTerminal) window.shell.run.execTerminal(query)
    else window.shell.run.exec(query)
    hideLauncher()
  })
  const alternate = run.runInTerminal
    ? action("run-plain", "Run without terminal", Play, () => { window.shell.run.exec(query); hideLauncher() })
    : action("run-terminal", "Run in terminal", Terminal, () => { window.shell.run.execTerminal(query); hideLauncher() })
  return [exec, alternate]
}

function entryActions(entry: LauncherEntry, context: LauncherActionContext): LauncherAction[] {
  switch (entry.kind) {
    case "window": return windowActions(entry.app, entry.launchItem)
    case "tab": return tabActions(entry.tab)
    case "app": return appActions(entry.item, context)
    case "bookmark": return bookmarkActions(entry.bookmark)
    case "setting": return settingActions(entry.setting, context)
    case "command": return commandActions(entry.command, context)
  }
}

export function rowActions(row: LauncherRow, context: LauncherActionContext): LauncherAction[] {
  if (row.kind === "entry") return withShortcuts(entryActions(row.entry, context))
  if (row.kind === "math") return withShortcuts([action("copy", "Copy result", Copy, () => copyAndHide(row.value))])
  if (row.kind === "run") return withShortcuts(runActions(row.query, row.run))
  return withShortcuts([action("search", "Search the web", Globe, () => {
    window.shell.bookmarks.open(`${WEB_SEARCH_URL}${encodeURIComponent(row.query)}`)
    hideLauncher()
  })])
}
