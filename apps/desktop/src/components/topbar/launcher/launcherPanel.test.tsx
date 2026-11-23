import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { ThemeProvider } from "../../themeContext"
import LauncherPanel from "./launcherPanel"

vi.mock("../../../hooks/useSettingsValue", () => ({
  useSettingsValues: () => ({}),
  writeSettingsValue: vi.fn(() => Promise.resolve(true)),
}))

const NOTEPAD = "C:\\Windows\\System32\\notepad.exe"
const CALCULATOR = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"

function catalogItem(id: number, name: string, target: string, lnkPath: string | null = null): LauncherItem {
  return { id, name, lnkPath, target, icon: null }
}

let launcher: Record<string, ReturnType<typeof vi.fn>>
let shell: {
  windows: Record<string, ReturnType<typeof vi.fn>>
  apps: Record<string, ReturnType<typeof vi.fn>>
  bookmarks: Record<string, ReturnType<typeof vi.fn>>
  system: Record<string, ReturnType<typeof vi.fn>>
  run: Record<string, ReturnType<typeof vi.fn>>
  browserTabs: Record<string, ReturnType<typeof vi.fn>>
  settingsIcon: string
}
let clipboardWrites: string[]

function stubBridges({ catalog = [] as LauncherItem[], openApps = [] as OpenApp[] } = {}) {
  const unsubscribe = () => () => {}
  launcher = {
    hide: vi.fn(),
    launch: vi.fn(() => Promise.resolve({ success: true })),
    launchAdmin: vi.fn(() => Promise.resolve({ success: true })),
    openLocation: vi.fn(() => Promise.resolve({ success: true })),
    uninstall: vi.fn(() => Promise.resolve({ ok: true, mode: "desktop" })),
    endTask: vi.fn(() => Promise.resolve({ success: true })),
    recordSelection: vi.fn(() => Promise.resolve(true)),
    reportPanelBottom: vi.fn(() => Promise.resolve()),
    onStartClose: vi.fn(unsubscribe),
    scores: vi.fn(() => Promise.resolve({ usage: {}, queries: {} })),
    onScoresChanged: vi.fn(unsubscribe),
    maxResults: vi.fn(() => Promise.resolve(8)),
    onMaxResultsChanged: vi.fn(unsubscribe),
    showBookmarks: vi.fn(() => Promise.resolve(false)),
    onShowBookmarksChanged: vi.fn(unsubscribe),
    showBrowserTabs: vi.fn(() => Promise.resolve(false)),
    onShowBrowserTabsChanged: vi.fn(unsubscribe),
    semanticModel: vi.fn(() => Promise.resolve(null)),
    takeScreenshot: vi.fn(() => Promise.resolve()),
    onEmojiKey: vi.fn(unsubscribe),
    recentEmoji: vi.fn(() => Promise.resolve([])),
  }
  shell = {
    windows: {
      openApps: vi.fn(() => Promise.resolve(openApps)),
      onOpenAppsChanged: vi.fn(unsubscribe),
      activate: vi.fn(() => Promise.resolve()),
      minimize: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      closeSettings: vi.fn(() => Promise.resolve()),
      openSettings: vi.fn(() => Promise.resolve()),
      minimizeAll: vi.fn(() => Promise.resolve()),
      restoreMinimized: vi.fn(() => Promise.resolve()),
    },
    apps: {
      catalog: vi.fn(() => Promise.resolve(catalog)),
      onCatalogChanged: vi.fn(unsubscribe),
      windowCommand: vi.fn(() => Promise.resolve({ ok: true })),
    },
    bookmarks: {
      list: vi.fn(() => Promise.resolve([])),
      onChanged: vi.fn(unsubscribe),
      open: vi.fn(() => Promise.resolve({ ok: true })),
    },
    system: {
      powerAction: vi.fn(() => Promise.resolve()),
      powerConfirm: vi.fn(() => Promise.resolve(true)),
      showHibernate: vi.fn(() => Promise.resolve(true)),
      onShowHibernateChanged: vi.fn(unsubscribe),
      onPowerConfirmChanged: vi.fn(unsubscribe),
    },
    run: {
      resolve: vi.fn(() => Promise.resolve(null)),
      exec: vi.fn(() => Promise.resolve()),
      execTerminal: vi.fn(() => Promise.resolve()),
    },
    browserTabs: {
      list: vi.fn(() => Promise.resolve([])),
      onChanged: vi.fn(unsubscribe),
      activate: vi.fn(() => Promise.resolve({ ok: true })),
    },
    settingsIcon: "",
  }
  clipboardWrites = []
  Object.assign(window, { launcher, shell })
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (text: string) => { clipboardWrites.push(text); return Promise.resolve() } },
  })
}

async function openLauncher() {
  render(
    <ThemeProvider value={{ darkText: false, bg: "rgb(31,32,32)", onMenuOpenChange: () => {} }}>
      <LauncherPanel />
    </ThemeProvider>
  )
  await act(async () => {})
  return screen.getByPlaceholderText("Search apps, windows and settings") as HTMLInputElement
}

async function type(input: HTMLInputElement, text: string) {
  fireEvent.change(input, { target: { value: text } })
  await act(async () => {})
}

function press(input: HTMLInputElement, key: string, options: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(input, { key, ...options })
}

describe("LauncherPanel", () => {
  beforeEach(() => stubBridges())

  it("opens to nothing but the search bar", async () => {
    await openLauncher()
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("lists matching open windows first and switches to one on Enter", async () => {
    stubBridges({
      catalog: [catalogItem(0, "Notepad", NOTEPAD)],
      openApps: [{ id: 41, hwnd: 7, name: "Notepad", title: "shopping list.txt - Notepad", path: NOTEPAD, icon: "" }],
    })
    const input = await openLauncher()
    await type(input, "shopping")
    const groups = screen.getAllByRole("group")
    expect(groups[0].getAttribute("aria-label")).toBe("Windows")
    expect(groups[0].textContent).toContain("shopping list.txt - Notepad")

    press(input, "Enter")
    expect(shell.windows.activate).toHaveBeenCalledWith(7)
    expect(launcher.hide).toHaveBeenCalled()
  })

  it("launches an app on Enter and remembers what was picked for the query", async () => {
    stubBridges({ catalog: [catalogItem(3, "Calculator", CALCULATOR)] })
    const input = await openLauncher()
    await type(input, "calc")
    press(input, "Enter")
    expect(launcher.launch).toHaveBeenCalledWith(3)
    expect(launcher.recordSelection).toHaveBeenCalledWith(CALCULATOR.toLowerCase(), "calc")
  })

  it("runs the second action on Ctrl+Enter", async () => {
    stubBridges({ catalog: [catalogItem(3, "Calculator", CALCULATOR)] })
    const input = await openLauncher()
    await type(input, "calc")
    press(input, "Enter", { ctrlKey: true })
    expect(launcher.launchAdmin).toHaveBeenCalledWith(3)
  })

  it("opens the actions with Ctrl+K and runs the one picked", async () => {
    stubBridges({ catalog: [catalogItem(3, "Calculator", CALCULATOR, "C:\\Start\\Calculator.lnk")] })
    const input = await openLauncher()
    await type(input, "calc")
    press(input, "k", { ctrlKey: true })
    const menu = screen.getByRole("menu")
    expect(Array.from(menu.querySelectorAll("[role=menuitem]")).map((item) => item.textContent)).toEqual([
      "Open↵",
      "Run as administratorCtrl ↵",
      "Open file location",
      "Uninstall",
    ])
    press(input, "ArrowDown")
    press(input, "ArrowDown")
    press(input, "Enter")
    expect(launcher.openLocation).toHaveBeenCalledWith(3)
  })

  it("closes the actions again on Escape without hiding the launcher", async () => {
    stubBridges({ catalog: [catalogItem(3, "Calculator", CALCULATOR)] })
    const input = await openLauncher()
    await type(input, "calc")
    press(input, "k", { ctrlKey: true })
    press(input, "Escape")
    expect(screen.queryByRole("menu")).toBeNull()
    expect(launcher.hide).not.toHaveBeenCalled()
  })

  it("works out arithmetic and copies the answer", async () => {
    const input = await openLauncher()
    await type(input, "12*3")
    expect(screen.getByRole("group", { name: "Calculator" }).textContent).toContain("36")
    press(input, "Enter")
    expect(clipboardWrites).toEqual(["36"])
  })

  it("offers a web search when nothing matches", async () => {
    const input = await openLauncher()
    await type(input, "weather tomorrow")
    expect(screen.getByRole("group", { name: "Web" }).textContent).toContain("weather tomorrow")
    press(input, "Enter")
    expect(shell.bookmarks.open).toHaveBeenCalledWith("https://www.google.com/search?q=weather%20tomorrow")
  })

  it("asks once more before shutting down", async () => {
    const input = await openLauncher()
    await type(input, "shut down")
    press(input, "Enter")
    expect(shell.system.powerAction).not.toHaveBeenCalled()
    expect(screen.getByRole("listbox").textContent).toContain("Confirm shut down")
    press(input, "Enter")
    expect(shell.system.powerAction).toHaveBeenCalledWith("shutdown")
  })

  it("hibernates on Enter", async () => {
    const input = await openLauncher()
    await type(input, "hibernate")
    press(input, "Enter")
    expect(shell.system.powerAction).toHaveBeenCalledWith("hibernate")
  })

  it("moves through results with the arrow keys", async () => {
    stubBridges({ catalog: [catalogItem(0, "Notepad", NOTEPAD), catalogItem(1, "Notepad Helper", "C:\\Tools\\nphelper.exe")] })
    const input = await openLauncher()
    await type(input, "notepad")
    press(input, "ArrowDown")
    press(input, "Enter")
    expect(launcher.launch).toHaveBeenCalledWith(1)
  })

  it("moves one row at a time through shortcuts that share a target", async () => {
    const CMD = "C:\\Windows\\System32\\cmd.exe"
    stubBridges({
      catalog: [
        catalogItem(0, "Command Prompt", CMD, "C:\\Start\\Command Prompt.lnk"),
        catalogItem(1, "Developer Command Prompt", CMD, "C:\\Start\\Developer Command Prompt.lnk"),
      ],
    })
    const input = await openLauncher()
    await type(input, "cmd")
    press(input, "ArrowDown")
    press(input, "Enter")
    expect(launcher.launch).toHaveBeenCalledWith(1)
  })

  it("hides and restores focus on Escape", async () => {
    const input = await openLauncher()
    press(input, "Escape")
    expect(launcher.hide).toHaveBeenCalledWith({ restoreFocus: true })
  })

  it("hides without restoring focus on window blur", async () => {
    await openLauncher()
    window.dispatchEvent(new Event("blur"))
    expect(launcher.hide).toHaveBeenCalledWith()
  })

  it("activates the browser window before selecting a matched browser tab", async () => {
    const order: string[] = []
    stubBridges()
    launcher.showBrowserTabs.mockResolvedValue(true)
    shell.browserTabs.list.mockResolvedValue([{ hwnd: 77, browser: "chrome", index: 2, selected: false, title: "Alpine Board" }])
    shell.windows.activate.mockImplementation(() => { order.push("window"); return Promise.resolve() })
    shell.browserTabs.activate.mockImplementation(() => { order.push("tab"); return Promise.resolve({ ok: true }) })
    launcher.hide.mockImplementation(() => { order.push("hide") })

    const input = await openLauncher()
    await type(input, "Alpine Board")
    press(input, "Enter")

    expect(shell.windows.activate).toHaveBeenCalledWith(77)
    expect(shell.browserTabs.activate).toHaveBeenCalledWith({ hwnd: 77, browser: "chrome", index: 2, selected: false, title: "Alpine Board" })
    expect(order).toEqual(["window", "tab", "hide"])
  })
})
