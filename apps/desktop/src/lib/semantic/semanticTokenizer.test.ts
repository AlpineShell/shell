import { describe, expect, it } from "vitest"
import { normalizeForSearch, splitWords, tokenIds, wordPieceIds } from "./semanticTokenizer"

const VOCAB = new Map<string, number>([
  ["wi", 0],
  ["##fi", 1],
  ["-", 2],
  ["cafe", 3],
  ["un", 4],
  ["##afford", 5],
  ["##able", 6],
  ["strasse", 7],
  ["dark", 8],
  ["mode", 9],
])

describe("normalizeForSearch", () => {
  it("lowercases and drops accents the way the model's tokenizer did", () => {
    expect(normalizeForSearch("Café ÜBER")).toBe("cafe uber")
  })

  it("spells ß as ss so German words keep their meaning", () => {
    expect(normalizeForSearch("Straße")).toBe("strasse")
  })

  it("turns every kind of whitespace into a plain space and drops control characters", () => {
    expect(normalizeForSearch("dark\tmode\u0007\n")).toBe("dark mode ")
  })

  it("spaces out CJK ideographs so each is its own word", () => {
    expect(splitWords(normalizeForSearch("搜索app"))).toEqual(["搜", "索", "app"])
  })
})

describe("splitWords", () => {
  it("splits on spaces and makes each punctuation mark its own word", () => {
    expect(splitWords("wi-fi, on!")).toEqual(["wi", "-", "fi", ",", "on", "!"])
  })

  it("ignores repeated spaces", () => {
    expect(splitWords("  dark   mode ")).toEqual(["dark", "mode"])
  })
})

describe("wordPieceIds", () => {
  it("takes the longest known piece first and marks continuations with ##", () => {
    expect(wordPieceIds("unaffordable", VOCAB)).toEqual([4, 5, 6])
  })

  it("gives up on a word with an unknown piece instead of guessing", () => {
    expect(wordPieceIds("unknown", VOCAB)).toEqual([])
  })

  it("refuses absurdly long words", () => {
    expect(wordPieceIds("a".repeat(101), new Map([["a", 0], ["##a", 1]]))).toEqual([])
  })
})

describe("tokenIds", () => {
  it("tokenizes a whole phrase, skipping words it cannot read", () => {
    expect(tokenIds("Wi-Fi café zzz", VOCAB)).toEqual([0, 2, 3])
  })
})
