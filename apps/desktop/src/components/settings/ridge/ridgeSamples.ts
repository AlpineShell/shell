export const RIDGE_SAMPLE_PEAK = 0.6

export const RIDGE_SAMPLE_MEDIA_TITLE = 'Now playing'

export const RIDGE_SAMPLE_MICROPHONE_APPS: string[] = []

export const RIDGE_SAMPLE_NOTICE: NoticeFaceProps['notice'] = {
  title: null,
  message: 'Notices show here',
  tone: 'info',
  busy: false,
}

export const RIDGE_PRESENCE_NOTES: Partial<Record<TopbarItemId, string>> = {
  'plugins-left': 'Widgets that plugins place on the left of Ridge show here.',
  notice: 'Shows on Ridge only while Alpine Shell has a notice for you.',
  tray: 'Shows on Ridge once apps put icons in the system tray.',
  media: 'Shows on Ridge only while something is playing.',
  microphone: 'Shows on Ridge only while an app is using the microphone.',
  'plugins-right': 'Widgets that plugins place on the right of Ridge show here.',
}

const SAMPLE_TRAY_ICON_IDS = ['sample-tray-first', 'sample-tray-second', 'sample-tray-third']

function sampleTraySquareFill(darkText: boolean): string {
  return darkText ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.35)'
}

function sampleTraySquare(darkText: boolean): string {
  const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="3" fill="${sampleTraySquareFill(darkText)}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(square)}`
}

export function ridgeSampleTrayIcons(darkText: boolean): TrayFaceIcon[] {
  const icon = sampleTraySquare(darkText)
  return SAMPLE_TRAY_ICON_IDS.map((id) => ({ id, tooltip: '', icon }))
}

export function trayCaretShown(tray: RidgeTrayPreviewData): boolean {
  return tray.showOverflow && tray.overflow.length > 0
}

export function ridgeMediaTitle(media: RidgeMediaPreviewData): string | null {
  return media.playback.title || null
}

const SHOWS_A_SAMPLE: Record<TopbarItemId, (data: RidgePreviewData) => boolean> = {
  'system-menu': () => false,
  'plugins-left': (data) => data.plugins.left.length === 0,
  notice: () => true,
  launcher: () => false,
  tray: (data) => data.tray.visible.length === 0 && !trayCaretShown(data.tray),
  media: (data) => ridgeMediaTitle(data.media) === null,
  microphone: (data) => !data.microphone.active,
  status: () => false,
  'plugins-right': (data) => data.plugins.right.length === 0,
  clock: () => false,
}

export function ridgeItemIsSample(id: TopbarItemId, data: RidgePreviewData): boolean {
  return SHOWS_A_SAMPLE[id](data)
}
