import { describe, it, expect } from "vitest"
import {
  deriveFields,
  scoreItem,
  scoreField,
  exeBasename,
  frecencyBoost,
  frecencyKey,
  TIER_GAP,
} from "./launcherSearch"

const vscode = deriveFields({ name: "Visual Studio Code", target: "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe" })
const chrome = deriveFields({ name: "Google Chrome", target: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" })
const calculator = deriveFields({ name: "Calculator", target: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" })
const photoshop = deriveFields({ name: "Adobe Photoshop 2024", target: "C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\Photoshop.exe" })

describe("scoreItem matches the real-world cases users type", () => {
  it("finds Visual Studio Code when typing 'vscode' (the reported bug)", () => {
    expect(scoreItem("vscode", vscode)).toBeGreaterThan(0)
  })

  it("finds Visual Studio Code via 'vsc', 'code', 'vs code' and the full name", () => {
    expect(scoreItem("vsc", vscode)).toBeGreaterThan(0)
    expect(scoreItem("code", vscode)).toBeGreaterThan(0)
    expect(scoreItem("vs code", vscode)).toBeGreaterThan(0)
    expect(scoreItem("visual studio code", vscode)).toBeGreaterThan(0)
  })

  it("finds Photoshop via the 'ps' semantic alias", () => {
    expect(scoreItem("ps", photoshop)).toBeGreaterThan(0)
  })

  it("matches the exe basename for desktop paths ('chrome' -> chrome.exe)", () => {
    expect(scoreItem("chrome", chrome)).toBeGreaterThan(0)
    expect(chrome.exe).toBe("chrome")
    expect(exeBasename("C:\\x\\chrome.exe")).toBe("chrome")
  })

  it("returns -1 for non-matches and for an empty query", () => {
    expect(scoreItem("zzzz", vscode)).toBeLessThan(0)
    expect(scoreItem("", vscode)).toBeLessThan(0)
  })

  it("does not derive an exe field from a UWP AUMID target", () => {
    expect(calculator.exe).toBeNull()
    expect(scoreItem("calc", calculator)).toBeGreaterThan(0)
  })
})

describe("scoreField ranking tiers are ordered exact > prefix > word-boundary > scattered", () => {
  it("ranks an exact match above a prefix match above a scattered match", () => {
    const exact = scoreField("code", "code")
    const prefix = scoreField("code", "code runner")
    const wordPrefix = scoreField("vsc", "Visual Studio Code")
    const scattered = scoreField("cl", "Calculator")
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(wordPrefix)
    expect(wordPrefix).toBeGreaterThan(scattered)
  })

  it("prefers a word-boundary/camelCase match over a mid-word scattered one", () => {
    const camel = scoreField("pt", "PowerToys")
    const scattered = scoreField("pt", "Spotify")
    expect(camel).toBeGreaterThan(scattered)
  })
})

describe("curated aliases never outrank a genuine text match in another app", () => {
  it("ranks a real word-boundary name match above a semantic alias for the same query", () => {
    const stickyNotes = deriveFields({ name: "Sticky Notes", target: "Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe!App" })
    const oneNote = deriveFields({ name: "Microsoft OneNote", target: "Microsoft.Office.OneNote_8wekyb3d8bbwe!microsoft.onenoteim" })
    expect(scoreItem("notes", stickyNotes)).toBeGreaterThan(scoreItem("notes", oneNote))
  })

  it("still surfaces an app reachable only via its alias", () => {
    const photoshop = deriveFields({ name: "Adobe Photoshop 2024", target: "C:\\Program Files\\Adobe\\Photoshop.exe" })
    expect(scoreItem("ps", photoshop)).toBeGreaterThan(0)
  })
})

describe("frecency boost reorders within a tier but never crosses one", () => {
  it("caps the boost below a single tier gap", () => {
    expect(frecencyBoost(0)).toBe(0)
    expect(frecencyBoost(1_000_000)).toBeLessThan(TIER_GAP)
    expect(frecencyBoost(50)).toBeGreaterThan(0)
  })

  it("a maximally-frecent mid-word subsequence match cannot cross into the prefix tier", () => {
    const midWordSubsequenceScore = scoreField("od", "Notepad")
    const prefixMatchScore = scoreField("note", "Notepad")
    expect(midWordSubsequenceScore + frecencyBoost(10_000_000)).toBeLessThan(prefixMatchScore)
  })

  it("the acronym field lets a frecent acronym match rank strongly without crossing tiers", () => {
    const vsc = deriveFields({ name: "Visual Studio Code", target: "C:\\x\\Code.exe" })
    const midWordSubsequenceAtMaxFrecency = scoreField("od", "Notepad") + frecencyBoost(10_000_000)
    expect(scoreItem("vsc", vsc)).toBeGreaterThan(midWordSubsequenceAtMaxFrecency)
  })

  it("reorders two equally-relevant prefix matches by frecency", () => {
    const terminalPrefixScore = scoreField("te", "Terminal")
    const telegramPrefixScore = scoreField("te", "Telegram")
    expect(Math.abs(terminalPrefixScore - telegramPrefixScore)).toBeLessThan(frecencyBoost(5000))
  })
})

describe("frecencyKey normalizes targets consistently", () => {
  it("lowercases, trims and strips surrounding quotes", () => {
    expect(frecencyKey('  "C:\\Apps\\Code.EXE" ')).toBe("c:\\apps\\code.exe")
    expect(frecencyKey("")).toBe("")
  })
})
