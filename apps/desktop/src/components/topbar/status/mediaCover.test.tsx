import { describe, it, expect, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import MediaCover from './mediaCover'
import { RidgeBackdropProvider } from '../ridgeBackdrop'
import { setChromeSurface } from '../chrome/chromeStore'

const COVER = 'data:image/png;base64,aGVsbG8='

function renderInPopup(backdrop: HTMLElement) {
  const popup = document.createElement('div')
  document.body.appendChild(popup)
  render(
    <RidgeBackdropProvider value={backdrop}>
      <MediaCover src={COVER} />
    </RidgeBackdropProvider>,
    { container: popup },
  )
  return popup
}

function openSurface(contentEl: HTMLElement | null) {
  act(() => setChromeSurface({ id: 1, centerX: 0, bodyWidth: 320, fullHeight: 90, anchor: 'center', contentEl }))
}

afterEach(() => {
  act(() => setChromeSurface(null))
  document.body.innerHTML = ''
})

describe('MediaCover', () => {
  it('draws the cover in the popup and carries it up into the Ridge', () => {
    const backdrop = document.createElement('div')
    const popup = renderInPopup(backdrop)
    expect(popup.querySelector('img')?.getAttribute('src')).toBe(COVER)
    expect(backdrop.querySelector('img')?.getAttribute('src')).toBe(COVER)
  })

  it('keeps the Ridge part hidden until its own popup is open', () => {
    const backdrop = document.createElement('div')
    const popup = renderInPopup(backdrop)
    const ridgeCover = () => backdrop.querySelector('img') as HTMLImageElement
    expect(ridgeCover().style.opacity).toBe('0')

    openSurface(document.createElement('div'))
    expect(ridgeCover().style.opacity).toBe('0')

    openSurface(popup)
    expect(Number(ridgeCover().style.opacity)).toBeGreaterThan(0)

    act(() => setChromeSurface(null))
    expect(ridgeCover().style.opacity).toBe('0')
  })

  it('stays inside the popup when there is no Ridge to reach into', () => {
    const popup = document.createElement('div')
    document.body.appendChild(popup)
    render(<MediaCover src={COVER} />, { container: popup })
    expect(popup.querySelectorAll('img')).toHaveLength(1)
  })
})
