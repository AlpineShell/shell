import { describe, it, expect, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import MediaCover from './mediaCover'
import { RidgeBackdropProvider } from '../ridgeBackdrop'
import { getSurfaceBackdrop, setChromeSurface } from '../chrome/chromeStore'

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
  act(() => setChromeSurface({ id: 1, centerX: 500, bodyWidth: 320, fullHeight: 90, anchor: 'center', contentEl }))
}

afterEach(() => {
  act(() => setChromeSurface(null))
  document.body.innerHTML = ''
})

describe('MediaCover', () => {
  it('draws the cover in the popup and carries it up into the Ridge', () => {
    const backdrop = document.createElement('div')
    const popup = renderInPopup(backdrop)
    openSurface(popup)
    expect(popup.querySelector('img')?.getAttribute('src')).toBe(COVER)
    expect(backdrop.querySelector('img')?.getAttribute('src')).toBe(COVER)
  })

  it('reaches into the Ridge only once its own popup is open', () => {
    const backdrop = document.createElement('div')
    const popup = renderInPopup(backdrop)
    expect(backdrop.querySelector('img')).toBeNull()

    openSurface(document.createElement('div'))
    expect(backdrop.querySelector('img')).toBeNull()

    openSurface(popup)
    expect(backdrop.querySelector('img')).not.toBeNull()
  })

  it('hands its Ridge part to the chrome canvas, hidden until the canvas draws it', () => {
    const backdrop = document.createElement('div')
    const popup = renderInPopup(backdrop)
    openSurface(popup)
    const ridgeLayer = backdrop.firstElementChild as HTMLElement
    expect(getSurfaceBackdrop(popup)).toBe(ridgeLayer)
    expect(ridgeLayer.style.opacity).toBe('0')
  })

  it('keeps its Ridge part for the canvas to fade while the popup closes', () => {
    const backdrop = document.createElement('div')
    const popup = renderInPopup(backdrop)
    openSurface(popup)
    act(() => setChromeSurface(null))
    expect(getSurfaceBackdrop(popup)).toBe(backdrop.firstElementChild)
  })

  it('hides its Ridge part when another menu takes the Ridge', () => {
    const backdrop = document.createElement('div')
    const popup = renderInPopup(backdrop)
    openSurface(popup)
    act(() => setChromeSurface({ id: 2, centerX: 100, bodyWidth: 200, fullHeight: 60, anchor: 'center', contentEl: document.createElement('div') }))
    expect((backdrop.firstElementChild as HTMLElement).style.visibility).toBe('hidden')
  })

  it('holds the popup cover still while the popup slides open, like the Ridge behind it', async () => {
    const backdrop = document.createElement('div')
    const popup = renderInPopup(backdrop)
    openSurface(popup)
    const popupCover = () => (popup.querySelector('img') as HTMLImageElement).style.getPropertyValue('translate')
    popup.style.setProperty('translate', '0px -30px')
    await waitFor(() => expect(popupCover()).toBe('0px 30px'))
    popup.style.setProperty('translate', '0px 0px')
    await waitFor(() => expect(popupCover()).toBe('0px 0px'))
  })

  it('stays inside the popup when there is no Ridge to reach into', () => {
    const popup = document.createElement('div')
    document.body.appendChild(popup)
    render(<MediaCover src={COVER} />, { container: popup })
    expect(popup.querySelectorAll('img')).toHaveLength(1)
  })
})
