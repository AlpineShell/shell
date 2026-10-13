const RESULT_LIST_CAP = 560
const RESULT_LIST_DISPLAY_SHARE = 0.7
const MENU_LIST_CAP = 260
const MENU_LIST_DISPLAY_SHARE = 0.6
const SEARCH_BAR_HEIGHT = 48
const DIVIDER_HEIGHT = 1
const FOOTER_HEIGHT = 36

function capToDisplay(cap: number, displayShare: number): number {
  return Math.min(cap, Math.round(window.screen.height * displayShare))
}

export function resultListMaxHeight(): number {
  return capToDisplay(RESULT_LIST_CAP, RESULT_LIST_DISPLAY_SHARE)
}

export function menuListMaxHeight(): number {
  return capToDisplay(MENU_LIST_CAP, MENU_LIST_DISPLAY_SHARE)
}

export function searchPanelMaxHeight(): number {
  return SEARCH_BAR_HEIGHT + DIVIDER_HEIGHT + resultListMaxHeight() + DIVIDER_HEIGHT + FOOTER_HEIGHT
}
