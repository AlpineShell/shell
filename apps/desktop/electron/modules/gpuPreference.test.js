import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import gpuPreference from './gpuPreference.js'

const { readStoredHighPerformance, storeHighPerformance, prefersHighPerformanceGpu, startupGpuAction } = gpuPreference

let userDataDir = ''

const storeFile = () => path.join(userDataDir, 'gpu-prefs.json')

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-gpu-preference-'))
})

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('the stored GPU preference', () => {
  it('keeps the high-performance GPU off until someone turns it on', () => {
    expect(readStoredHighPerformance(storeFile())).toBeNull()
    expect(prefersHighPerformanceGpu(storeFile())).toBe(false)
  })

  it('remembers the choice either way', () => {
    storeHighPerformance(true, storeFile())
    expect(prefersHighPerformanceGpu(storeFile())).toBe(true)
    storeHighPerformance(false, storeFile())
    expect(readStoredHighPerformance(storeFile())).toBe(false)
    expect(prefersHighPerformanceGpu(storeFile())).toBe(false)
  })

  it('treats a damaged file as no choice at all', () => {
    fs.writeFileSync(storeFile(), '{ not json')
    expect(readStoredHighPerformance(storeFile())).toBeNull()
    fs.writeFileSync(storeFile(), JSON.stringify({ highPerformance: 'yes' }))
    expect(readStoredHighPerformance(storeFile())).toBeNull()
  })
})

describe('startupGpuAction', () => {
  it('pins the high-performance GPU only for someone who chose it', () => {
    expect(startupGpuAction(true)).toBe('pin')
  })

  it('removes the pin older versions set for everyone who never chose', () => {
    expect(startupGpuAction(null)).toBe('unpin')
  })

  it('leaves Windows alone once someone chose to stay off', () => {
    expect(startupGpuAction(false)).toBe('none')
  })
})
