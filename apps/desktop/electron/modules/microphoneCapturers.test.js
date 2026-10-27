import { describe, it, expect } from 'vitest'
import microphoneCapturers from './microphoneCapturers.js'

const { prefersPowerShellMicrophone } = microphoneCapturers

describe('prefersPowerShellMicrophone', () => {
  it('honours the backend override only in development', () => {
    const override = { ALPINE_MICROPHONE_BACKEND: 'powershell' }
    expect(prefersPowerShellMicrophone(false, override)).toBe(true)
    expect(prefersPowerShellMicrophone(true, override)).toBe(false)
    expect(prefersPowerShellMicrophone(false, {})).toBe(false)
  })
})
