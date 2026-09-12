import { describe, it, expect } from 'vitest'
import { EMPTY_TOPBAR_LAYOUT, TOPBAR_ITEMS, resolveTopbarLayout } from '../../topbar/layout/topbarLayout'
import { moveTopbarItem } from '../../topbar/layout/topbarLayoutEdits'
import {
  RIDGE_KEYBOARD_HINT,
  ridgeCancelAnnouncement,
  ridgeDropAnnouncement,
  ridgeEdgeAnnouncement,
  ridgeGrabAnnouncement,
  ridgeHiddenAnnouncement,
  ridgeMoveAnnouncement,
  ridgePositionPhrase,
  ridgeRefusedAnnouncement,
  ridgeShownAnnouncement,
  ridgeSideLabel,
} from './ridgeAnnouncements'

const DEFAULT_ITEMS = resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT)
const CLOCK_IN_CENTER = moveTopbarItem(DEFAULT_ITEMS, 'clock', { slot: 'center', index: 1 })

const withHidden = (...ids: TopbarItemId[]) =>
  resolveTopbarLayout({ slots: { left: [], center: [], right: [] }, hidden: ids })

describe('ridgeSideLabel', () => {
  it.each([
    ['left', 'Left'],
    ['center', 'Center'],
    ['right', 'Right'],
  ] as const)('names the %s side %s', (slot, label) => {
    expect(ridgeSideLabel(slot)).toBe(label)
  })
})

describe('ridgePositionPhrase', () => {
  it('counts from one within the side', () => {
    expect(ridgePositionPhrase(DEFAULT_ITEMS, 'system-menu')).toBe('position 1 of 3 on the left')
    expect(ridgePositionPhrase(DEFAULT_ITEMS, 'launcher')).toBe('position 1 of 1 in the center')
    expect(ridgePositionPhrase(DEFAULT_ITEMS, 'clock')).toBe('position 6 of 6 on the right')
  })

  it('counts only the items that show', () => {
    expect(ridgePositionPhrase(withHidden('media'), 'clock')).toBe('position 5 of 5 on the right')
  })

  it('counts a hidden item at the place it would show', () => {
    expect(ridgePositionPhrase(withHidden('clock'), 'clock')).toBe('position 6 of 6 on the right')
  })

  it('follows an item to its new side', () => {
    expect(ridgePositionPhrase(CLOCK_IN_CENTER, 'clock')).toBe('position 2 of 2 in the center')
  })
})

describe('Ridge announcements', () => {
  it('announces picking an item up where it stands', () => {
    expect(ridgeGrabAnnouncement(DEFAULT_ITEMS, 'clock')).toBe('Clock picked up, position 6 of 6 on the right.')
  })

  it('announces each step of a move', () => {
    expect(ridgeMoveAnnouncement(CLOCK_IN_CENTER, 'clock')).toBe('Clock, position 2 of 2 in the center.')
  })

  it('announces the drop', () => {
    expect(ridgeDropAnnouncement(CLOCK_IN_CENTER, 'clock')).toBe('Clock dropped, position 2 of 2 in the center.')
  })

  it('announces a cancelled move with the place the item went back to', () => {
    expect(ridgeCancelAnnouncement(DEFAULT_ITEMS, 'clock')).toBe('Clock returned to position 6 of 6 on the right.')
  })

  it('announces a step past the end of the bar', () => {
    expect(ridgeEdgeAnnouncement(DEFAULT_ITEMS, 'system-menu')).toBe(
      "Power menu can't move any further, position 1 of 3 on the left."
    )
  })

  it('announces a refused move with the side that refused it', () => {
    expect(ridgeRefusedAnnouncement('plugins-left', 'center')).toBe(
      "Left plugins can't move to the center. Plugin groups stay on their own side."
    )
    expect(ridgeRefusedAnnouncement('plugins-right', 'left')).toBe(
      "Right plugins can't move to the left. Plugin groups stay on their own side."
    )
  })

  it('announces hiding and showing an item', () => {
    expect(ridgeHiddenAnnouncement('launcher')).toBe('Search button hidden from Ridge.')
    expect(ridgeShownAnnouncement(DEFAULT_ITEMS, 'media')).toBe('Media added, position 2 of 6 on the right.')
  })

  it('names every item with the label the bar catalogue gives it', () => {
    for (const item of TOPBAR_ITEMS) {
      expect(ridgeHiddenAnnouncement(item.id)).toBe(`${item.label} hidden from Ridge.`)
    }
  })
})

describe('RIDGE_KEYBOARD_HINT', () => {
  it('names every key a chip answers to', () => {
    for (const key of ['Enter', 'Space', 'arrow keys', 'Escape', 'Delete']) {
      expect(RIDGE_KEYBOARD_HINT).toContain(key)
    }
  })
})
