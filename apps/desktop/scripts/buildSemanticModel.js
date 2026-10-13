const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MODEL_REPO = 'minishlab/potion-base-8M'
const MODEL_REVISION = 'bf8b056651a2c21b8d2565580b8569da283cab23'
const SOURCE_FILES = {
  tokenizer: { name: 'tokenizer.json', sha256: 'e67e803f624fb4d67dea1c730d06e1067e1b14d830e2c2202569e3ef0f70bb50' },
  weights: { name: 'model.safetensors', sha256: 'f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2' },
}
const OUTPUT_PATH = path.join(__dirname, '..', 'electron', 'assets', 'semanticSearchModel.bin')
const MAGIC = 'ASM1'
const HEADER_BYTES = 16
const INT8_LIMIT = 127
const SPECIAL_TOKEN = /^\[[A-Z]+\]$/

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function sourceUrl(fileName) {
  return `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${fileName}`
}

async function readSource(file, cacheDir) {
  const cached = cacheDir ? path.join(cacheDir, file.name) : null
  const buffer = cached && fs.existsSync(cached)
    ? fs.readFileSync(cached)
    : Buffer.from(await (await fetch(sourceUrl(file.name))).arrayBuffer())
  const actual = sha256(buffer)
  if (actual !== file.sha256) throw new Error(`${file.name} has sha256 ${actual}, expected ${file.sha256}`)
  return buffer
}

function readSafetensorsMatrix(buffer, tensorName) {
  const headerLength = Number(buffer.readBigUInt64LE(0))
  const header = JSON.parse(buffer.subarray(8, 8 + headerLength).toString('utf8'))
  const tensor = header[tensorName]
  if (!tensor || tensor.dtype !== 'F32' || tensor.shape.length !== 2) throw new Error(`${tensorName} is not a 2-D F32 tensor`)
  const [start, end] = tensor.data_offsets.map((offset) => 8 + headerLength + offset)
  const values = new Float32Array(buffer.buffer.slice(buffer.byteOffset + start, buffer.byteOffset + end))
  return { rows: tensor.shape[0], dim: tensor.shape[1], values }
}

function isLatinSearchToken(token) {
  if (SPECIAL_TOKEN.test(token)) return false
  const bare = token.startsWith('##') ? token.slice(2) : token
  return /^[\x21-\x7e]+$/.test(bare)
}

function keptVocabulary(vocab) {
  return Object.entries(vocab)
    .filter(([token]) => isLatinSearchToken(token))
    .sort((a, b) => a[1] - b[1])
}

function quantizeRow(values, offset, dim) {
  let largest = 0
  for (let d = 0; d < dim; d++) largest = Math.max(largest, Math.abs(values[offset + d]))
  const scale = largest > 0 ? largest / INT8_LIMIT : 1
  const quantized = new Int8Array(dim)
  for (let d = 0; d < dim; d++) quantized[d] = Math.round(values[offset + d] / scale)
  return { scale, quantized }
}

function alignTo4(length) {
  return (length + 3) & ~3
}

function encodeModelFile({ dim, tokens, scales, values }) {
  const vocabBytes = Buffer.from(tokens.join('\n'), 'utf8')
  const scalesOffset = alignTo4(HEADER_BYTES + vocabBytes.length)
  const valuesOffset = scalesOffset + tokens.length * 4
  const file = Buffer.alloc(valuesOffset + tokens.length * dim)
  file.write(MAGIC, 0, 'ascii')
  file.writeUInt32LE(dim, 4)
  file.writeUInt32LE(tokens.length, 8)
  file.writeUInt32LE(vocabBytes.length, 12)
  vocabBytes.copy(file, HEADER_BYTES)
  for (let row = 0; row < tokens.length; row++) file.writeFloatLE(scales[row], scalesOffset + row * 4)
  Buffer.from(values.buffer, values.byteOffset, values.byteLength).copy(file, valuesOffset)
  return file
}

function compactModel(tokenizerJson, matrix) {
  const kept = keptVocabulary(tokenizerJson.model.vocab)
  const scales = new Float32Array(kept.length)
  const values = new Int8Array(kept.length * matrix.dim)
  kept.forEach(([, sourceRow], row) => {
    const { scale, quantized } = quantizeRow(matrix.values, sourceRow * matrix.dim, matrix.dim)
    scales[row] = scale
    values.set(quantized, row * matrix.dim)
  })
  return { dim: matrix.dim, tokens: kept.map(([token]) => token), scales, values }
}

async function run(cacheDir) {
  const tokenizerJson = JSON.parse((await readSource(SOURCE_FILES.tokenizer, cacheDir)).toString('utf8'))
  const matrix = readSafetensorsMatrix(await readSource(SOURCE_FILES.weights, cacheDir), 'embeddings')
  const file = encodeModelFile(compactModel(tokenizerJson, matrix))
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, file)
  console.log(`[semantic] Wrote ${OUTPUT_PATH} (${file.length} bytes, sha256 ${sha256(file)})`)
}

if (require.main === module) {
  run(process.argv[2]).catch((error) => {
    console.error('[semantic] Model build failed:', error.message)
    process.exit(1)
  })
}

module.exports = {
  MAGIC,
  HEADER_BYTES,
  isLatinSearchToken,
  keptVocabulary,
  quantizeRow,
  encodeModelFile,
  compactModel,
  readSafetensorsMatrix,
  run,
}
