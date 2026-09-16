import { describe, it, expect } from "vitest"
import {
  EMPTY_LAUNCHER_MEMORY,
  normalizeLauncherQuery,
  learnedBoost,
  rankScore,
  rankEntries,
  adoptInstalledAppMatch,
  appResultKey,
  tabResultKey,
  settingResultKey,
  windowCommandResultKey,
} from "./launcherRanking"
import { deriveFields, scoreItem, TIER_GAP } from "./launcherSearch"

const YOUTUBE_TARGET = "C:\\Users\\me\\AppData\\Local\\Chromium\\YouTube.lnk"
const YT_DLP_TARGET = "C:\\Tools\\yt-dlp.exe"
const YOUTUBE_MUSIC_TARGET = "C:\\Users\\me\\AppData\\Local\\Chromium\\YouTube Music.lnk"

function appCandidate(name: string, target: string, query: string) {
  return { kind: "app" as const, key: appResultKey(target), match: scoreItem(query, deriveFields({ name, target })), name }
}

describe("normalizeLauncherQuery", () => {
  it("matches how the main process stores queries", () => {
    expect(normalizeLauncherQuery("  YT   Music ")).toBe("yt music")
  })
})

describe("learnedBoost", () => {
  it("gives nothing without memory or query", () => {
    expect(learnedBoost(undefined, "yt")).toEqual({ boost: 0, anchored: false })
    expect(learnedBoost({ yt: 1 }, "  ")).toEqual({ boost: 0, anchored: false })
  })

  it("boosts an exact learned query by several tiers and grows with repeated picks", () => {
    const once = learnedBoost({ yt: 1 }, "YT")
    const often = learnedBoost({ yt: 8 }, "yt")
    expect(once.anchored).toBe(true)
    expect(once.boost).toBeGreaterThanOrEqual(3 * TIER_GAP)
    expect(often.boost).toBeGreaterThan(once.boost)
    expect(often.boost).toBeLessThanOrEqual(6 * TIER_GAP)
  })

  it("gives a partial boost while the learned query is still being typed", () => {
    const partial = learnedBoost({ yt: 1 }, "y")
    expect(partial.anchored).toBe(true)
    expect(partial.boost).toBeGreaterThan(0)
    expect(partial.boost).toBeLessThan(learnedBoost({ yt: 1 }, "yt").boost)
  })

  it("gives a small unanchored boost when typing past the learned query", () => {
    const extended = learnedBoost({ yt: 1 }, "ytm")
    expect(extended.anchored).toBe(false)
    expect(extended.boost).toBeGreaterThan(0)
  })

  it("fades as the learned weight decays", () => {
    expect(learnedBoost({ yt: 0.25 }, "yt").boost).toBeLessThan(learnedBoost({ yt: 1 }, "yt").boost)
  })
})

describe("rankScore", () => {
  it("puts the app picked for 'yt' above a stronger text match after one pick", () => {
    const youtube = appCandidate("YouTube", YOUTUBE_TARGET, "yt")
    const youtubeMusic = appCandidate("YouTube Music", YOUTUBE_MUSIC_TARGET, "yt")
    expect(rankScore(youtube, EMPTY_LAUNCHER_MEMORY, "yt")).toBeGreaterThan(rankScore(youtubeMusic, EMPTY_LAUNCHER_MEMORY, "yt"))

    const memory = { usage: {}, queries: { [youtubeMusic.key]: { yt: 1 } } }
    expect(rankScore(youtubeMusic, memory, "yt")).toBeGreaterThan(rankScore(youtube, memory, "yt"))
  })

  it("keeps the most often picked result first when two were picked for the same query", () => {
    const youtube = appCandidate("YouTube", YOUTUBE_TARGET, "yt")
    const ytDlp = appCandidate("yt-dlp", YT_DLP_TARGET, "yt")
    const memory = { usage: {}, queries: { [youtube.key]: { yt: 1 }, [ytDlp.key]: { yt: 6 } } }
    expect(rankScore(ytDlp, memory, "yt")).toBeGreaterThan(rankScore(youtube, memory, "yt"))
  })

  it("keeps a learned result reachable even when its name no longer matches", () => {
    const renamed = { kind: "app" as const, key: "c:\\apps\\tube.exe", match: -1 }
    expect(rankScore(renamed, EMPTY_LAUNCHER_MEMORY, "yt")).toBe(-1)
    expect(rankScore(renamed, { usage: {}, queries: { [renamed.key]: { yt: 1 } } }, "yt")).toBeGreaterThan(0)
  })

  it("does not resurrect an unmatched result from a merely extended query", () => {
    const renamed = { kind: "app" as const, key: "c:\\apps\\tube.exe", match: -1 }
    expect(rankScore(renamed, { usage: {}, queries: { [renamed.key]: { yt: 1 } } }, "ytxyz")).toBe(-1)
  })

  it("lets frequent use reorder equally good matches", () => {
    const terminal = appCandidate("Terminal", "C:\\wt.exe", "te")
    const telegram = appCandidate("Telegram", "C:\\telegram.exe", "te")
    const memory = { usage: { [telegram.key]: 5000 }, queries: {} }
    expect(rankScore(telegram, memory, "te")).toBeGreaterThan(rankScore(terminal, memory, "te"))
  })

  it("prefers switching to an open window over an equally matched setting", () => {
    const open = { kind: "open" as const, key: "c:\\chrome.exe", match: 50_000 }
    const setting = { kind: "setting" as const, key: settingResultKey("chrome"), match: 50_000 }
    expect(rankScore(open, EMPTY_LAUNCHER_MEMORY, "chrome")).toBeGreaterThan(rankScore(setting, EMPTY_LAUNCHER_MEMORY, "chrome"))
  })
})

describe("rankEntries", () => {
  it("drops non-matches and sorts every kind in one list", () => {
    const entries = rankEntries(
      [
        { kind: "setting" as const, key: settingResultKey("bluetooth"), match: 40_000 },
        { kind: "app" as const, key: "c:\\none.exe", match: -1 },
        { kind: "tab" as const, key: tabResultKey("youtube.com", "Video"), match: 30_000 },
        { kind: "open" as const, key: "c:\\bt.exe", match: 40_000 },
      ],
      EMPTY_LAUNCHER_MEMORY,
      "bt",
    )
    expect(entries.map((entry) => entry.kind)).toEqual(["open", "setting", "tab"])
  })
})

describe("result keys", () => {
  it("share app keys with the stored launch history and namespace the rest", () => {
    expect(appResultKey('  "C:\\Apps\\Code.EXE" ')).toBe("c:\\apps\\code.exe")
    expect(tabResultKey("YouTube.com", "Some video")).toBe("tab:youtube.com")
    expect(tabResultKey(null, "Inbox")).toBe("tab:inbox")
    expect(settingResultKey("wifi")).toBe("setting:wifi")
    expect(windowCommandResultKey("maximize")).toBe("wincmd:maximize")
  })
})

describe("adoptInstalledAppMatch", () => {
  const openTeams = { kind: "open" as const, key: "c:\program files\windowsapps\msteams\ms-teams.exe", match: 10_101 }
  const installedTeams = { kind: "app" as const, key: "msteams_8wekyb3d8bbwe!msteams", match: 19_998 }

  it("lets a running window stand in for its installed app without losing the app's match or memory", () => {
    expect(adoptInstalledAppMatch(openTeams, installedTeams)).toEqual({ ...openTeams, key: installedTeams.key, match: 19_998 })
  })

  it("keeps the window's own match when it is already the better one", () => {
    expect(adoptInstalledAppMatch({ ...openTeams, match: 30_000 }, installedTeams)).toEqual({ ...openTeams, match: 30_000 })
    expect(adoptInstalledAppMatch(openTeams, undefined)).toBe(openTeams)
  })
})
