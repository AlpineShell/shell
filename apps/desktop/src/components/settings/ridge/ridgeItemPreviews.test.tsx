import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { TOPBAR_ITEMS } from '../../topbar/layout/topbarLayout'
import { clearWidgets, registerContribution } from '../../../plugins/pluginRegistry'
import { RIDGE_ITEM_PREVIEWS } from './ridgeItemPreviewMap'
import { RIDGE_PRESENCE_NOTES, ridgeItemIsSample } from './ridgeSamples'
import { absentRidgePreviewData, liveRidgePreviewData, ridgeTrayIcon } from './ridgeTestFixtures'

const ITEM_IDS = TOPBAR_ITEMS.map((item) => item.id)
const ELEMENT_IDS = TOPBAR_ITEMS.filter((item) => item.kind === 'element').map((item) => item.id)
const PLUGIN_GROUP_IDS = TOPBAR_ITEMS.filter((item) => item.kind === 'plugin-group').map((item) => item.id)
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, [tabindex], [role='button'], [contenteditable]"

function renderPreview(id: TopbarItemId, data: RidgePreviewData, darkText = false): HTMLElement {
  return render(createElement(RIDGE_ITEM_PREVIEWS[id], { data, darkText })).container
}

function isMarkedSample(container: HTMLElement): boolean {
  return container.querySelector('[data-sample]') !== null
}

function iconNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('svg')).map((svg) => Array.from(svg.classList).find((name) => name.startsWith('lucide-')))
}

function barHeights(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll('rect')).map((rect) => Number(rect.getAttribute('height')))
}

function imageSources(container: HTMLElement) {
  return Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))
}

function registerWidget(slot: TopbarSlot, text: string, order = 0) {
  registerContribution({
    type: 'topbar-widget',
    id: `com.example.${text.toLowerCase()}:default`,
    component: () => createElement('span', null, text),
    slot,
    order,
  })
}

function CrashingWidget(): never {
  throw new Error('the widget crashed')
}

afterEach(() => {
  clearWidgets()
  vi.restoreAllMocks()
})

describe.each(ITEM_IDS)('the %s preview', (id) => {
  it.each([true, false])('renders nothing a pointer or key can act on when darkText is %s', (darkText) => {
    for (const data of [liveRidgePreviewData(), absentRidgePreviewData()]) {
      expect(renderPreview(id, data, darkText).querySelectorAll(INTERACTIVE_SELECTOR)).toHaveLength(0)
    }
  })
})

describe.each(ELEMENT_IDS)('the %s preview', (id) => {
  it('marks itself as a sample exactly when ridgeItemIsSample says it is one', () => {
    for (const data of [liveRidgePreviewData(), absentRidgePreviewData()]) {
      expect(isMarkedSample(renderPreview(id, data))).toBe(ridgeItemIsSample(id, data))
    }
  })
})

describe.each(PLUGIN_GROUP_IDS)('the %s preview', (id) => {
  it('never stands in with a sample, drawing only the widgets that are live', () => {
    for (const data of [liveRidgePreviewData(), absentRidgePreviewData()]) {
      expect(isMarkedSample(renderPreview(id, data))).toBe(false)
    }
  })
})

describe('ridgeItemIsSample', () => {
  it('stands in for nothing while every item has live data', () => {
    const data = liveRidgePreviewData()
    expect(ITEM_IDS.filter((id) => ridgeItemIsSample(id, data))).toEqual([])
  })

  it('stands in for every item the bar would leave out', () => {
    const data = absentRidgePreviewData()
    expect(ITEM_IDS.filter((id) => ridgeItemIsSample(id, data))).toEqual([
      'plugins-left',
      'tray',
      'media',
      'microphone',
      'plugins-right',
    ])
  })
})

describe('RIDGE_PRESENCE_NOTES', () => {
  it('says when each item that can be absent shows, without calling the bar the top bar', () => {
    const data = absentRidgePreviewData()
    for (const id of ITEM_IDS.filter((item) => ridgeItemIsSample(item, data))) {
      expect(RIDGE_PRESENCE_NOTES[id]).toBeTruthy()
      expect(RIDGE_PRESENCE_NOTES[id]).not.toMatch(/top ?bar/i)
    }
  })
})

describe('SystemMenuPreview and LauncherPreview', () => {
  it('draw the live power menu and Search button faces', () => {
    const data = liveRidgePreviewData()
    expect(iconNames(renderPreview('system-menu', data))).toEqual(['lucide-circle-dashed'])
    expect(renderPreview('launcher', data).textContent).toBe('Search')
  })
})

describe('ClockPreview', () => {
  it.each<[TimeFormat, ResolvedTimeFormat, string]>([
    ['24h', '12h', '21:41 Sep 12'],
    ['12h', '24h', '9:41 PM Sep 12'],
    ['auto', '12h', '9:41 PM Sep 12'],
    ['auto', '24h', '21:41 Sep 12'],
  ])('reads a %s clock on a %s system as %s', (timeFormat, systemTimeFormat, expected) => {
    const live = liveRidgePreviewData()
    const data = { ...live, clock: { ...live.clock, prefs: { ...live.clock.prefs, timeFormat, systemTimeFormat } } }
    expect(renderPreview('clock', data).textContent).toBe(expected)
  })
})

describe('MediaPreview', () => {
  function mediaData(playback: Partial<MediaPlayback>, showVisualizer: boolean): RidgePreviewData {
    const live = liveRidgePreviewData()
    return { ...live, media: { playback: { ...live.media.playback, ...playback }, showVisualizer } }
  }

  it('leads with the app icon while the visualizer is off', () => {
    const data = mediaData({}, false)
    const container = renderPreview('media', data)
    expect(imageSources(container)).toEqual([`data:image/png;base64,${data.media.playback.appIcon}`])
    expect(container.textContent).toBe('Blue in Green')
  })

  it('draws lively bars instead of the icon while the visualizer is on', () => {
    const container = renderPreview('media', mediaData({}, true))
    expect(imageSources(container)).toEqual([])
    expect(barHeights(container).every((height) => height > 2)).toBe(true)
  })

  it('rests the bars while playback is paused', () => {
    expect(barHeights(renderPreview('media', mediaData({ playing: false }, true)))).toEqual([2, 2, 2, 2, 2])
  })

  it('treats an empty title as nothing playing, as the bar does', () => {
    expect(isMarkedSample(renderPreview('media', mediaData({ title: '' }, false)))).toBe(true)
  })

  it('stands in with lively bars under "Now playing" when nothing plays', () => {
    const container = renderPreview('media', absentRidgePreviewData())
    expect(container.textContent).toBe('Now playing')
    expect(imageSources(container)).toEqual([])
    expect(barHeights(container).every((height) => height > 2)).toBe(true)
  })
})

describe('MicrophonePreview', () => {
  function microphoneData(microphone: MicrophoneStatus): RidgePreviewData {
    return { ...liveRidgePreviewData(), microphone }
  }

  it('names the apps using the microphone', () => {
    expect(renderPreview('microphone', microphoneData({ active: true, apps: ['Zoom', 'Teams'] })).textContent).toBe('Zoom, Teams')
  })

  it('says "In use" when it cannot name the apps', () => {
    const container = renderPreview('microphone', microphoneData({ active: true, apps: [] }))
    expect(container.textContent).toBe('In use')
    expect(isMarkedSample(container)).toBe(false)
  })

  it('stands in with "In use" while no app uses it', () => {
    const container = renderPreview('microphone', microphoneData({ active: false, apps: [] }))
    expect(container.textContent).toBe('In use')
    expect(isMarkedSample(container)).toBe(true)
  })
})

describe('TrayPreview', () => {
  const dropbox = ridgeTrayIcon('dropbox')
  const onedrive = ridgeTrayIcon('onedrive')
  const steam = ridgeTrayIcon('steam')

  function trayData(tray: RidgeTrayPreviewData): RidgePreviewData {
    return { ...liveRidgePreviewData(), tray }
  }

  it('draws the visible icons in order, with the caret for the hidden ones', () => {
    const container = renderPreview('tray', trayData({ visible: [onedrive, dropbox], overflow: [steam], showOverflow: true }))
    expect(imageSources(container)).toEqual([onedrive.icon, dropbox.icon])
    expect(iconNames(container)).toEqual(['lucide-chevron-down'])
  })

  it('leaves the caret out while the overflow arrow is off', () => {
    expect(iconNames(renderPreview('tray', trayData({ visible: [onedrive], overflow: [steam], showOverflow: false })))).toEqual([])
  })

  it('leaves the caret out when no icon is hidden', () => {
    expect(iconNames(renderPreview('tray', trayData({ visible: [onedrive], overflow: [], showOverflow: true })))).toEqual([])
  })

  it('keeps the lone caret, not a sample, when every icon is hidden', () => {
    const container = renderPreview('tray', trayData({ visible: [], overflow: [steam], showOverflow: true }))
    expect(iconNames(container)).toEqual(['lucide-chevron-down'])
    expect(isMarkedSample(container)).toBe(false)
  })

  it('stands in with three squares drawn to show on a dark bar and on a light one', () => {
    const onDarkBar = imageSources(renderPreview('tray', absentRidgePreviewData(), false))
    const onLightBar = imageSources(renderPreview('tray', absentRidgePreviewData(), true))
    expect(onDarkBar).toHaveLength(3)
    expect(onLightBar).toHaveLength(3)
    for (const source of [...onDarkBar, ...onLightBar]) expect(source).toMatch(/^data:image\/svg\+xml,/)
    expect(onDarkBar[0]).not.toBe(onLightBar[0])
  })
})

describe('StatusPreview', () => {
  it('draws Bluetooth, Wi-Fi and battery from the live status, taking the Wi-Fi radio as on', () => {
    expect(iconNames(renderPreview('status', liveRidgePreviewData()))).toEqual([
      'lucide-bluetooth-connected',
      'lucide-wifi',
      'lucide-battery-medium',
    ])
  })
})

describe('the plugin group previews', () => {
  it('draw the live widgets registered on their own side, in their order', () => {
    registerWidget('left', 'Weather')
    registerWidget('right', 'Notes', 2)
    registerWidget('right', 'Radar', 1)
    const data = liveRidgePreviewData()
    expect(renderPreview('plugins-left', data).textContent).toBe('Weather')
    expect(renderPreview('plugins-right', data).textContent).toBe('RadarNotes')
  })

  it('draw nothing while no widget is live on their side', () => {
    registerWidget('left', 'Weather')
    const container = renderPreview('plugins-right', liveRidgePreviewData())
    expect(container.textContent).toBe('')
    expect(iconNames(container)).toEqual([])
  })

  it('keep a widget that crashes from taking the others down', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    registerContribution({ type: 'topbar-widget', id: 'com.example.broken:default', component: CrashingWidget, slot: 'left' })
    registerWidget('left', 'Weather', 1)
    expect(renderPreview('plugins-left', liveRidgePreviewData()).textContent).toBe('Weather')
  })
})

describe('NoticePreview', () => {
  it('always shows the sample notice', () => {
    expect(renderPreview('notice', liveRidgePreviewData()).textContent).toBe('Notices show here')
  })
})
