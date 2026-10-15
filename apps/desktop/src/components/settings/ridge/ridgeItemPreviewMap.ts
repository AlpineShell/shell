import {
  ClockPreview,
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
  desktops: DesktopsPreview,
  'plugins-left': LeftPluginsPreview,
  notice: NoticePreview,
  launcher: LauncherPreview,
  tray: TrayPreview,
  media: MediaPreview,
  microphone: MicrophonePreview,
  status: StatusPreview,
  'plugins-right': RightPluginsPreview,
  clock: ClockPreview,
}
