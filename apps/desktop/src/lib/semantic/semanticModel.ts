import { tokenIds } from "./semanticTokenizer"

const MAGIC = "ASM1"
const HEADER_BYTES = 16

function alignTo4(length: number): number {
  return (length + 3) & ~3
}

export function parseSemanticModel(bytes: ArrayBuffer | Uint8Array): SemanticModel {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const buffer = view.byteOffset % 4 === 0 ? view : view.slice()
  const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const magic = String.fromCharCode(...buffer.subarray(0, 4))
  if (magic !== MAGIC) throw new Error(`Not a semantic search model (magic ${JSON.stringify(magic)})`)
  const dim = data.getUint32(4, true)
  const rows = data.getUint32(8, true)
  const vocabBytes = data.getUint32(12, true)
  const tokens = new TextDecoder().decode(buffer.subarray(HEADER_BYTES, HEADER_BYTES + vocabBytes)).split("\n")
  if (tokens.length !== rows) throw new Error(`Model lists ${tokens.length} tokens for ${rows} rows`)
  const scalesOffset = alignTo4(HEADER_BYTES + vocabBytes)
  const valuesOffset = scalesOffset + rows * 4
  if (buffer.byteLength < valuesOffset + rows * dim) throw new Error("Semantic search model is truncated")
  return {
    dim,
    vocab: new Map(tokens.map((token, row) => [token, row])),
    scales: new Float32Array(buffer.buffer, buffer.byteOffset + scalesOffset, rows),
    values: new Int8Array(buffer.buffer, buffer.byteOffset + valuesOffset, rows * dim),
  }
}

export function embedText(model: SemanticModel, text: string): Float32Array | null {
  const ids = tokenIds(text, model.vocab)
  if (ids.length === 0) return null
  const sum = new Float32Array(model.dim)
  for (const row of ids) {
    const scale = model.scales[row]
    const base = row * model.dim
    for (let d = 0; d < model.dim; d++) sum[d] += model.values[base + d] * scale
  }
  let length = 0
  for (let d = 0; d < model.dim; d++) length += sum[d] * sum[d]
  length = Math.sqrt(length)
  if (length === 0) return null
  for (let d = 0; d < model.dim; d++) sum[d] /= length
  return sum
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let d = 0; d < a.length; d++) dot += a[d] * b[d]
  return dot
}

export function createSemanticIndex(model: SemanticModel, cacheLimit = 4096): SemanticIndex {
  const vectors = new Map<string, Float32Array | null>()

  function vectorFor(text: string): Float32Array | null {
    const cached = vectors.get(text)
    if (cached !== undefined) return cached
    if (vectors.size >= cacheLimit) vectors.clear()
    const vector = embedText(model, text)
    vectors.set(text, vector)
    return vector
  }

  return {
    embedQuery: (query) => embedText(model, query),
    similarity(queryVector, text) {
      const vector = vectorFor(text)
      return vector ? cosineSimilarity(queryVector, vector) : 0
    },
  }
}
