import { describe, expect, it } from 'vitest'
import modelBuilder from './buildSemanticModel.js'
import { embedText, parseSemanticModel } from '../src/lib/semantic/semanticModel.ts'

const { isLatinSearchToken, keptVocabulary, quantizeRow, compactModel, encodeModelFile, readSafetensorsMatrix, MAGIC } = modelBuilder

function safetensors(rows, dim, values) {
  const header = Buffer.from(JSON.stringify({ embeddings: { dtype: 'F32', shape: [rows, dim], data_offsets: [0, values.length * 4] } }))
  const length = Buffer.alloc(8)
  length.writeBigUInt64LE(BigInt(header.length))
  return Buffer.concat([length, header, Buffer.from(new Float32Array(values).buffer)])
}

describe('isLatinSearchToken', () => {
  it('keeps plain words and their continuations', () => {
    expect(isLatinSearchToken('wallpaper')).toBe(true)
    expect(isLatinSearchToken('##ing')).toBe(true)
    expect(isLatinSearchToken('!')).toBe(true)
  })

  it('drops special tokens and scripts the normalizer never produces from Latin text', () => {
    expect(isLatinSearchToken('[UNK]')).toBe(false)
    expect(isLatinSearchToken('[CLS]')).toBe(false)
    expect(isLatinSearchToken('搜')).toBe(false)
    expect(isLatinSearchToken('##ß')).toBe(false)
    expect(isLatinSearchToken('é')).toBe(false)
  })
})

describe('keptVocabulary', () => {
  it('keeps the original row order', () => {
    expect(keptVocabulary({ b: 2, '[PAD]': 0, a: 1, 'ü': 3 })).toEqual([['a', 1], ['b', 2]])
  })
})

describe('quantizeRow', () => {
  it('maps the largest magnitude to ±127 and scales the rest', () => {
    const { scale, quantized } = quantizeRow(new Float32Array([0.5, -1, 0.25]), 0, 3)
    expect(Array.from(quantized)).toEqual([64, -127, 32])
    expect(scale).toBeCloseTo(1 / 127, 6)
  })

  it('leaves an all-zero row at zero without dividing by zero', () => {
    const { scale, quantized } = quantizeRow(new Float32Array([0, 0]), 0, 2)
    expect(scale).toBe(1)
    expect(Array.from(quantized)).toEqual([0, 0])
  })
})

describe('readSafetensorsMatrix', () => {
  it('reads the embedding matrix out of a safetensors file', () => {
    const matrix = readSafetensorsMatrix(safetensors(2, 2, [1, 2, 3, 4]), 'embeddings')
    expect(matrix).toMatchObject({ rows: 2, dim: 2 })
    expect(Array.from(matrix.values)).toEqual([1, 2, 3, 4])
  })

  it('refuses a file without that tensor', () => {
    expect(() => readSafetensorsMatrix(safetensors(1, 1, [1]), 'weights')).toThrow(/not a 2-D F32 tensor/)
  })
})

describe('encodeModelFile', () => {
  it('writes a file the renderer reads back token for token', () => {
    const tokenizerJson = { model: { vocab: { '[UNK]': 0, dark: 1, mode: 2, 'ß': 3 } } }
    const matrix = { rows: 4, dim: 2, values: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) }
    const file = encodeModelFile(compactModel(tokenizerJson, matrix))
    expect(file.subarray(0, 4).toString('ascii')).toBe(MAGIC)
    const model = parseSemanticModel(new Uint8Array(file))
    expect([...model.vocab.keys()]).toEqual(['dark', 'mode'])
    expect(Array.from(embedText(model, 'dark')).map((value) => Math.round(value * 1000) / 1000)).toEqual([1, 0])
  })
})
