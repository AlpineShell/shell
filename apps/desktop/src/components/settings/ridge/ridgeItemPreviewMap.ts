import {
  ClockPreview,
  DesktopLinesPreview,
  DesktopsPreview,
  LauncherPreview,
  LeftPluginsPreview,
  MediaPreview,
  MicrophonePreview,
  NoticePreview,
  RightPluginsPreview,
  StatusPreview,
  SystemMenuPreview,
  TrayPreview,
} from './ridgeItemPreviews'

export const RIDGE_ITEM_PREVIEWS: Record<TopbarItemId, RidgeItemPreview> = {
  'system-menu': SystemMenuPreview,
  'plugins-left': LeftPluginsPreview,
  desktops: DesktopsPreview,
  'desktop-lines': DesktopLinesPreview,
  notice: NoticePreview,
  launcher: LauncherPreview,
  tray: TrayPreview,
  media: MediaPreview,
  microphone: MicrophonePreview,
  status: StatusPreview,
  'plugins-right': RightPluginsPreview,
  clock: ClockPreview,
}
