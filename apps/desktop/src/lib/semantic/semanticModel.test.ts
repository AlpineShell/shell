import { describe, expect, it } from "vitest"
import { cosineSimilarity, createSemanticIndex, embedText, parseSemanticModel } from "./semanticModel"

const TOKENS = ["dark", "mode", "night", "theme", "##s"]
const ROWS = [
  [1, 0, 0],
  [0.6, 0.8, 0],
  [0.9, 0.1, 0.1],
  [0.5, 0.5, 0.5],
  [0, 0, 1],
]

function encodeTestModel(tokens: string[], rows: number[][]): Uint8Array {
  const dim = rows[0].length
  const vocab = new TextEncoder().encode(tokens.join("\n"))
  const scalesOffset = (16 + vocab.length + 3) & ~3
  const valuesOffset = scalesOffset + tokens.length * 4
  const bytes = new Uint8Array(valuesOffset + tokens.length * dim)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode("ASM1"), 0)
  view.setUint32(4, dim, true)
  view.setUint32(8, tokens.length, true)
  view.setUint32(12, vocab.length, true)
  bytes.set(vocab, 16)
  rows.forEach((row, index) => {
    const scale = Math.max(...row.map(Math.abs)) / 127 || 1
    view.setFloat32(scalesOffset + index * 4, scale, true)
    row.forEach((value, d) => view.setInt8(valuesOffset + index * dim + d, Math.round(value / scale)))
  })
  return bytes
}

describe("parseSemanticModel", () => {
  it("reads the vocabulary and dimensions", () => {
    const model = parseSemanticModel(encodeTestModel(TOKENS, ROWS))
    expect(model.dim).toBe(3)
    expect([...model.vocab.entries()]).toEqual(TOKENS.map((token, row) => [token, row]))
  })

  it("keeps each row within int8 rounding of the original", () => {
    const model = parseSemanticModel(encodeTestModel(TOKENS, ROWS))
    const row = model.vocab.get("mode") as number
    ROWS[1].forEach((value, d) => expect(model.values[row * 3 + d] * model.scales[row]).toBeCloseTo(value, 2))
  })

  it("reads a model that arrives at an odd offset inside a larger buffer", () => {
    const bytes = encodeTestModel(TOKENS, ROWS)
    const padded = new Uint8Array(bytes.length + 1)
    padded.set(bytes, 1)
    expect(parseSemanticModel(padded.subarray(1)).vocab.size).toBe(TOKENS.length)
  })

  it("refuses a file that is not a model", () => {
    expect(() => parseSemanticModel(new Uint8Array(32))).toThrow(/Not a semantic search model/)
  })

  it("refuses a truncated model", () => {
    const bytes = encodeTestModel(TOKENS, ROWS)
    expect(() => parseSemanticModel(bytes.subarray(0, bytes.length - 2))).toThrow(/truncated/)
  })
})

describe("embedText", () => {
  const model = parseSemanticModel(encodeTestModel(TOKENS, ROWS))

  it("averages the token vectors and scales the result to unit length", () => {
    const vector = embedText(model, "dark mode") as Float32Array
    expect(Math.hypot(...vector)).toBeCloseTo(1, 5)
    expect(vector[0]).toBeGreaterThan(vector[1])
  })

  it("has nothing to say about text without a single known token", () => {
    expect(embedText(model, "zzz qqq")).toBeNull()
    expect(embedText(model, "")).toBeNull()
  })

  it("scores related phrases higher than unrelated ones", () => {
    const dark = embedText(model, "dark") as Float32Array
    expect(cosineSimilarity(dark, embedText(model, "night") as Float32Array)).toBeGreaterThan(cosineSimilarity(dark, embedText(model, "themes") as Float32Array))
  })
})

describe("createSemanticIndex", () => {
  function countingModel() {
    const model = parseSemanticModel(encodeTestModel(TOKENS, ROWS))
    const counter = { reads: 0 }
    const vocab = new Map(model.vocab)
    const lookup = vocab.get.bind(vocab)
    vocab.get = (key: string) => { counter.reads++; return lookup(key) }
    return { model: { ...model, vocab }, counter }
  }

  it("embeds each document once and reuses it", () => {
    const { model, counter } = countingModel()
    const index = createSemanticIndex(model)
    const query = index.embedQuery("dark") as Float32Array
    const afterQuery = counter.reads
    index.similarity(query, "night theme")
    const afterFirst = counter.reads
    index.similarity(query, "night theme")
    expect(afterFirst).toBeGreaterThan(afterQuery)
    expect(counter.reads).toBe(afterFirst)
  })

  it("scores a document it cannot read as unrelated", () => {
    const index = createSemanticIndex(parseSemanticModel(encodeTestModel(TOKENS, ROWS)))
    expect(index.similarity(index.embedQuery("dark") as Float32Array, "zzz")).toBe(0)
  })

  it("starts over once its cache is full instead of growing forever", () => {
    const { model, counter } = countingModel()
    const index = createSemanticIndex(model, 1)
    const query = index.embedQuery("dark") as Float32Array
    index.similarity(query, "night")
    index.similarity(query, "theme")
    const beforeRepeat = counter.reads
    index.similarity(query, "night")
    expect(counter.reads).toBeGreaterThan(beforeRepeat)
  })
})
