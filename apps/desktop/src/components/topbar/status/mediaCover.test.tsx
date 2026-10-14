import { describe, it, expect, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import MediaCover from './mediaCover'
import { RidgeBackdropProvider } from '../ridgeBackdrop'
import { getSurfaceBackdrop, setChromeSurface } from '../chrome/chromeStore'

const COVER = 'data:image/png;base64,aGVsbG8='

function renderInPopup(ridge: HTMLElement | null) {
  const popup = document.createElement('div')
  document.body.appendChild(popup)
  render(
    <RidgeBackdropProvider value={ridge}>
      <MediaCover src={COVER} />
    </RidgeBackdropProvider>,
    { container: popup },
  )
  return popup
}

function openSurface(contentEl: HTMLElement | null) {
  act(() => setChromeSurface({ id: 1, centerX: 500, bodyWidth: 320, fullHeight: 90, anchor: 'center', contentEl }))
}

function surfaceLayer() {
  return Array.from(document.body.children).find((child) => (child as HTMLElement).style.position === 'fixed') as HTMLElement | undefined
}

afterEach(() => {
  cleanup()
  act(() => setChromeSurface(null))
  document.body.innerHTML = ''
})

describe('MediaCover', () => {
  it('lays the cover under the popup and up into the Ridge once its own popup is open', () => {
    const ridge = document.createElement('div')
    const popup = renderInPopup(ridge)
    expect(ridge.querySelector('img')).toBeNull()
    expect(surfaceLayer()).toBeUndefined()

    openSurface(document.createElement('div'))
    expect(ridge.querySelector('img')).toBeNull()

    openSurface(popup)
    expect(ridge.querySelector('img')?.getAttribute('src')).toBe(COVER)
    expect(surfaceLayer()?.querySelector('img')?.getAttribute('src')).toBe(COVER)
    expect(popup.querySelector('img')).toBeNull()
  })

  it('hands both layers to the chrome canvas, hidden until the canvas draws them', () => {
    const ridge = document.createElement('div')
    const popup = renderInPopup(ridge)
    openSurface(popup)
    const backdrop = getSurfaceBackdrop(popup)
    expect(backdrop?.bar).toBe(ridge.firstElementChild)
    expect(backdrop?.surface).toBe(surfaceLayer())
    expect(backdrop?.bar?.style.opacity).toBe('0')
    expect(backdrop?.surface?.style.opacity).toBe('0')
  })

  it('stays registered for the canvas to fade while the popup closes', () => {
    const ridge = document.createElement('div')
    const popup = renderInPopup(ridge)
    openSurface(popup)
    act(() => setChromeSurface(null))
    expect(getSurfaceBackdrop(popup)?.bar).toBe(ridge.firstElementChild)
  })

  it('hides both layers when another menu takes the Ridge', () => {
    const ridge = document.createElement('div')
    const popup = renderInPopup(ridge)
    openSurface(popup)
    act(() => setChromeSurface({ id: 2, centerX: 100, bodyWidth: 200, fullHeight: 60, anchor: 'center', contentEl: document.createElement('div') }))
    expect((ridge.firstElementChild as HTMLElement).style.visibility).toBe('hidden')
    expect(surfaceLayer()?.style.visibility).toBe('hidden')
  })

  it('still covers the popup when there is no Ridge to reach into', () => {
    const popup = renderInPopup(null)
    openSurface(popup)
    expect(getSurfaceBackdrop(popup)).toEqual({ bar: null, surface: surfaceLayer() })
  })
})
