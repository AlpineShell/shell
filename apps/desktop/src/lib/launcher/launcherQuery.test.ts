import { describe, expect, it } from "vitest"
import { Wifi } from "lucide-react"
import { EMPTY_LAUNCHER_MEMORY, appResultKey } from "../launcherRanking"
import { appEntries, bookmarkEntries, commandEntries, settingEntries, tabEntries, windowEntries } from "./launcherEntries"
import { LAUNCHER_COMMANDS } from "./launcherCommands"
import { SEMANTIC_THRESHOLD, WINDOW_SECTION_LIMIT, flattenRows, lexicalScore, searchLauncher, semanticScore } from "./launcherQuery"
import { TIER_GAP } from "../launcherSearch"

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const CODE = "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"
const NOTEPAD = "C:\\Windows\\System32\\notepad.exe"
const CALCULATOR = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"

function item(id: number, name: string, target: string): LauncherItem {
  return { id, name, lnkPath: null, target, icon: null }
}

function openWindow(hwnd: number, name: string, title: string, path: string): OpenApp {
  return { id: hwnd + 1000, hwnd, name, title, path, icon: "" }
}

const WIFI_SETTING = {
  id: "wifi",
  label: "Wi-Fi",
  description: "Wireless networks",
  keywords: ["wifi", "wireless", "network", "internet"],
  icon: Wifi,
  page: "wifi",
  group: "Page",
  order: 0,
  applies: "instant",
  control: { kind: "navigate", path: "wifi" },
} as SettingsEntry

const apps = appEntries([item(1, "Google Chrome", CHROME), item(2, "Visual Studio Code", CODE), item(3, "Notepad", NOTEPAD), item(4, "Calculator", CALCULATOR)])

function context(overrides: Partial<LauncherSearchContext> = {}): LauncherSearchContext {
  return { memory: EMPTY_LAUNCHER_MEMORY, maxResults: 8, semantic: null, run: null, ...overrides }
}

function sectionIds(sections: LauncherSection[]): LauncherSectionId[] {
  return sections.map((section) => section.id)
}

function rowIds(sections: LauncherSection[]): string[] {
  return flattenRows(sections).map((row) => row.id)
}

describe("searchLauncher", () => {
  it("shows nothing until something is typed", () => {
    expect(searchLauncher(apps, "", context())).toEqual([])
    expect(searchLauncher(apps, "   ", context())).toEqual([])
  })

  it("puts matching open windows above everything else", () => {
    const windows = windowEntries([openWindow(11, "Notepad", "todo.txt - Notepad", NOTEPAD)], apps)
    const sections = searchLauncher([...apps, ...windows], "note", context())
    expect(sectionIds(sections)[0]).toBe("windows")
    expect(rowIds(sections)[0]).toBe("window:11")
  })

  it("finds a window by the name in its title", () => {
    const windows = windowEntries([openWindow(12, "Visual Studio Code", "launcherQuery.ts - alpine-shell - Visual Studio Code", CODE)], apps)
    const sections = searchLauncher([...apps, ...windows], "alpine-shell", context())
    expect(rowIds(sections)[0]).toBe("window:12")
  })

  it("does not pin a window whose title only matches as scattered letters", () => {
    const windows = windowEntries([openWindow(13, "Notepad", "a long title about nothing", NOTEPAD)], apps)
    const sections = searchLauncher([...apps, ...windows], "ong", context())
    expect(sectionIds(sections)).not.toContain("windows")
  })

  it("lets an open window stand in for the app it runs", () => {
    const windows = windowEntries([openWindow(14, "Google Chrome", "News - Google Chrome", CHROME)], apps)
    const ids = rowIds(searchLauncher([...apps, ...windows], "chrome", context()))
    expect(ids).toContain("window:14")
    expect(ids).not.toContain(`app:${appResultKey(CHROME)}`)
  })

  it("keeps the app findable when none of its windows match", () => {
    const ids = rowIds(searchLauncher(apps, "chrome", context()))
    expect(ids[0]).toBe(`app:${appResultKey(CHROME)}`)
  })

  it("caps the windows section", () => {
    const many = Array.from({ length: WINDOW_SECTION_LIMIT + 3 }, (_unused, index) => openWindow(100 + index, "Notepad", `file ${index}.txt - Notepad`, NOTEPAD))
    const sections = searchLauncher([...apps, ...windowEntries(many, apps)], "notepad", context({ maxResults: 20 }))
    expect(sections[0].rows).toHaveLength(WINDOW_SECTION_LIMIT)
  })

  it("lists open browser tabs with the windows", () => {
    const tabs = tabEntries([{ hwnd: 20, browser: "chrome", index: 2, title: "Pull requests · AlpineShell", selected: false, host: "github.com" }], new Map(), [])
    const sections = searchLauncher([...apps, ...tabs], "pull requests", context())
    expect(sections[0]).toMatchObject({ id: "windows", rows: [{ id: "tab:20:2" }] })
  })

  it("orders the other sections by their best match", () => {
    const entries = [...apps, ...settingEntries([WIFI_SETTING], () => "")]
    expect(sectionIds(searchLauncher(entries, "wifi", context()))[0]).toBe("settings")
    expect(sectionIds(searchLauncher(entries, "code", context()))[0]).toBe("apps")
  })

  it("files quick actions with the commands", () => {
    const quick = { ...WIFI_SETTING, id: "wifi-quick", page: "quick-actions" } as SettingsEntry
    const sections = searchLauncher(settingEntries([quick], () => ""), "wifi", context())
    expect(sectionIds(sections)[0]).toBe("commands")
  })

  it("never shows more results than asked for", () => {
    const sections = searchLauncher([...apps, ...commandEntries(LAUNCHER_COMMANDS)], "o", context({ maxResults: 3 }))
    expect(flattenRows(sections).filter((row) => row.kind === "entry")).toHaveLength(3)
  })

  it("puts a calculation first and counts it against the budget", () => {
    const sections = searchLauncher(apps, "12*3", context({ maxResults: 1 }))
    expect(sections).toEqual([{ id: "calculator", rows: [{ kind: "math", id: "math", value: "36" }] }])
  })

  it("puts a path or link to run first and a command to run last", () => {
    const folder: RunResult = { kind: "folder", label: "Open folder", display: "C:\\Users", runInTerminal: false }
    const command: RunResult = { kind: "command", label: "Run notepad", display: "notepad", runInTerminal: false }
    expect(sectionIds(searchLauncher(apps, "c:\\users", context({ run: folder })))[0]).toBe("run")
    const sections = searchLauncher(apps, "notepad", context({ run: command }))
    expect(sectionIds(sections)).toEqual(["apps", "run", "web"])
  })

  it("offers a web search when little else matches", () => {
    expect(sectionIds(searchLauncher(apps, "weather in zurich", context()))).toEqual(["web"])
    const plenty = searchLauncher([...apps, ...commandEntries(LAUNCHER_COMMANDS)], "o", context())
    expect(sectionIds(plenty)).not.toContain("web")
  })

  it("brings back what you picked for a query before", () => {
    const memory: LauncherMemory = { usage: {}, queries: { [appResultKey(CALCULATOR)]: { work: 6 } } }
    expect(rowIds(searchLauncher(apps, "work", context({ memory })))[0]).toBe(`app:${appResultKey(CALCULATOR)}`)
  })

  it("lifts a meaning match above weak spelling matches", () => {
    const semantic: SemanticIndex = {
      embedQuery: () => new Float32Array([1]),
      similarity: (_vector, text) => (text.startsWith("Calculator") ? 0.7 : 0),
    }
    const sections = searchLauncher(apps, "math sums", context({ semantic }))
    const first = flattenRows(sections)[0]
    expect(first).toMatchObject({ id: `app:${appResultKey(CALCULATOR)}`, semantic: true })
  })

  it("does not ask the model about one- and two-letter queries", () => {
    let asked = 0
    const semantic: SemanticIndex = { embedQuery: () => { asked++; return null }, similarity: () => 0 }
    searchLauncher(apps, "no", context({ semantic }))
    expect(asked).toBe(0)
    searchLauncher(apps, "not", context({ semantic }))
    expect(asked).toBe(1)
  })

  it("matches bookmarks by title and, a little weaker, by address", () => {
    const bookmarks = bookmarkEntries([{ title: "Alpine docs", url: "https://alpineshell.com/docs" }])
    expect(rowIds(searchLauncher(bookmarks, "docs", context()))[0]).toBe("bookmark:https://alpineshell.com/docs")
    expect(rowIds(searchLauncher(bookmarks, "alpineshell.com", context()))[0]).toBe("bookmark:https://alpineshell.com/docs")
  })
})

describe("lexicalScore", () => {
  it("credits a name said inside a sentence", () => {
    const [notepad] = appEntries([item(3, "Notepad", NOTEPAD)])
    expect(lexicalScore(notepad, "open notepad please")).toBeGreaterThanOrEqual(3 * TIER_GAP)
  })

  it("needs whole words for that credit", () => {
    const [notepad] = appEntries([item(3, "Notepad", NOTEPAD)])
    expect(lexicalScore(notepad, "notepadding stuff")).toBeLessThan(3 * TIER_GAP)
  })
})

describe("semanticScore", () => {
  it("ignores similarities under the threshold", () => {
    expect(semanticScore(SEMANTIC_THRESHOLD - 0.01)).toBe(-1)
    expect(semanticScore(Number.NaN)).toBe(-1)
  })

  it("stays below a prefix match even for a perfect meaning match", () => {
    expect(semanticScore(SEMANTIC_THRESHOLD)).toBe(2 * TIER_GAP)
    expect(semanticScore(1)).toBeLessThan(4 * TIER_GAP)
  })
})
