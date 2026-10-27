import { describe, it, expect } from 'vitest'
import microphone from './microphone.js'

const { microphoneStatusOf } = microphone

describe('microphoneStatusOf', () => {
  it('reports an idle microphone when nothing captures', () => {
    expect(microphoneStatusOf([])).toEqual({ active: false, apps: [] })
  })

  it('names each capturing app once by its friendly name', () => {
    const capturing = [
      { name: 'ms-teams', path: null, description: 'Microsoft Teams (work or school)' },
      { name: 'recorder', path: null, description: 'Sound Recorder' },
      { name: 'ms-teams', path: null, description: null },
      { name: 'nameonly', path: null, description: null },
    ]
    expect(microphoneStatusOf(capturing)).toEqual({
      active: true,
      apps: ['Microsoft Teams', 'Sound Recorder', 'nameonly'],
    })
  })
})
