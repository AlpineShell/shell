import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { createSemanticIndex, parseSemanticModel } from "../semantic/semanticModel"
import { LAUNCHER_SETTINGS, settingsEntryHint } from "../../settings/registry"
import { EMPTY_LAUNCHER_MEMORY } from "../launcherRanking"
import { appEntries, commandEntries, settingEntries } from "./launcherEntries"
import { LAUNCHER_COMMANDS } from "./launcherCommands"
import { flattenRows, searchLauncher } from "./launcherQuery"

const MODEL_PATH = path.resolve(__dirname, "../../../electron/assets/semanticSearchModel.bin")

function app(id: number, name: string, target: string, description?: string): LauncherItem {
  return { id, name, lnkPath: null, target, icon: null, description }
}

const INSTALLED_APPS: LauncherItem[] = [
  app(1, "Google Chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "Web browser."),
  app(2, "Visual Studio Code", "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", "Code editor."),
  app(3, "Spotify", "C:\\Users\\me\\AppData\\Roaming\\Spotify\\Spotify.exe", "Music streaming."),
  app(4, "Discord", "C:\\Users\\me\\AppData\\Local\\Discord\\Update.exe", "Chat and voice for communities and friends."),
  app(5, "Microsoft Outlook", "C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE", "Email, calendar and contacts."),
  app(6, "Steam", "C:\\Program Files (x86)\\Steam\\steam.exe", "Game library and store."),
  app(7, "Microsoft Excel", "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE"),
  app(8, "Snipping Tool", "Microsoft.ScreenSketch_8wekyb3d8bbwe!App"),
  app(9, "Notepad", "C:\\Windows\\System32\\notepad.exe"),
  app(10, "Windows Terminal", "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App"),
  app(11, "Task Manager", "C:\\Windows\\System32\\Taskmgr.exe"),
  app(12, "Calculator", "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),
  app(13, "Paint", "Microsoft.Paint_8wekyb3d8bbwe!App"),
  app(14, "GitHub Desktop", "C:\\Users\\me\\AppData\\Local\\GitHubDesktop\\GitHubDesktop.exe"),
  app(15, "Docker Desktop", "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe", "Runs containers for development."),
  app(16, "OBS Studio", "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe"),
  app(17, "Figma", "C:\\Users\\me\\AppData\\Local\\Figma\\Figma.exe", "Design tool."),
  app(18, "Microsoft Teams", "MSTeams_8wekyb3d8bbwe!MSTeams", "Chat, calls and meetings."),
  app(19, "Microsoft Word", "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE"),
  app(20, "Camera", "Microsoft.WindowsCamera_8wekyb3d8bbwe!App"),
]

const semantic = createSemanticIndex(parseSemanticModel(fs.readFileSync(MODEL_PATH)))
const entries = [
  ...appEntries(INSTALLED_APPS),
  ...settingEntries(LAUNCHER_SETTINGS, settingsEntryHint),
  ...commandEntries(LAUNCHER_COMMANDS),
]

function topEntryIds(query: string, count = 3): string[] {
  const sections = searchLauncher(entries, query, { memory: EMPTY_LAUNCHER_MEMORY, maxResults: 8, semantic, run: null })
  return flattenRows(sections)
    .filter((row): row is Extract<LauncherRow, { kind: "entry" }> => row.kind === "entry")
    .slice(0, count)
    .map((row) => row.entry.id)
}

describe("semantic search against the shipped model", () => {
  it.each([
    ["change background", "setting:wallpaper"],
    ["desktop picture", "setting:wallpaper"],
    ["make screen darker", "setting:brightness"],
    ["dim the screen", "setting:brightness"],
    ["headphones", "setting:bluetooth"],
    ["wireless internet", "setting:wifi"],
    ["turn off computer", "command:shutdown"],
    ["power off the pc", "command:shutdown"],
    ["speakers louder", "setting:volume"],
    ["smiley", "setting:emoji"],
    ["web browser", "app:c:\\program files\\google\\chrome\\application\\chrome.exe"],
    ["code editor", "app:c:\\users\\me\\appdata\\local\\programs\\microsoft vs code\\code.exe"],
    ["listen to music", "app:c:\\users\\me\\appdata\\roaming\\spotify\\spotify.exe"],
    ["chat with friends", "app:c:\\users\\me\\appdata\\local\\discord\\update.exe"],
    ["check my email", "app:c:\\program files\\microsoft office\\root\\office16\\outlook.exe"],
    ["play games", "app:c:\\program files (x86)\\steam\\steam.exe"],
    ["video meeting", "app:msteams_8wekyb3d8bbwe!msteams"],
    ["capture the screen", "command:screenshot"],
  ])("finds %s", (query, expected) => {
    expect(topEntryIds(query)).toContain(expected)
  })

  it.each([
    ["turn off wifi", "setting:wifi"],
    ["open spotify", "app:c:\\users\\me\\appdata\\roaming\\spotify\\spotify.exe"],
    ["please lock the screen", "command:lock"],
  ])("puts the thing named inside a sentence first for %s", (query, expected) => {
    expect(topEntryIds(query, 1)).toEqual([expected])
  })

  it("keeps exact name matches ahead of meaning matches", () => {
    expect(topEntryIds("spotify", 1)).toEqual(["app:c:\\users\\me\\appdata\\roaming\\spotify\\spotify.exe"])
    expect(topEntryIds("wallpaper", 1)).toEqual(["setting:wallpaper"])
  })

  it.each(["zxqv", "qqqq", "lorem ipsum dolor"])("does not invent results for %s", (query) => {
    expect(topEntryIds(query)).toEqual([])
  })
})
