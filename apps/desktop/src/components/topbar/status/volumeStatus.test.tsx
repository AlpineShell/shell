import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import VolumeStatus from './volumeStatus'

describe('VolumeStatus', () => {
  it('draws nothing while the volume is not changing', () => {
    const { container } = render(<VolumeStatus volume={{ level: 0.5, showing: false }} darkText={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('springs out a pill with the speaker and the level while the volume changes', () => {
    const { container } = render(<VolumeStatus volume={{ level: 0.5, showing: true }} darkText={false} />)
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(container.querySelector('.lucide-volume2')).not.toBeNull()
    expect(container.querySelector<HTMLElement>('[data-volume-fill]')?.style.width).toBe('50%')
  })

  it('keeps the pill while it springs back in after the volume settles', () => {
    const { container, rerender } = render(<VolumeStatus volume={{ level: 0.5, showing: true }} darkText={false} />)
    rerender(<VolumeStatus volume={{ level: 0.5, showing: false }} darkText={false} />)
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })
})
