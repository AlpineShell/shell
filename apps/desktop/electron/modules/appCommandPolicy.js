const HSHELL_APPCOMMAND = 12
const APPCOMMAND_VOLUME_MUTE = 8
const APPCOMMAND_VOLUME_DOWN = 9
const APPCOMMAND_VOLUME_UP = 10
const APPCOMMAND_WITHOUT_DEVICE_BITS = 0x0FFF
const VOLUME_KEY_STEP_PERCENT = 2

function shellHookAppCommand(hookCode, lParam) {
  if (Number(hookCode) !== HSHELL_APPCOMMAND) return null
  return (Number(lParam) >>> 16) & APPCOMMAND_WITHOUT_DEVICE_BITS
}

function volumeKeyAction(appCommand) {
  if (appCommand === APPCOMMAND_VOLUME_UP) return { kind: 'step', delta: VOLUME_KEY_STEP_PERCENT }
  if (appCommand === APPCOMMAND_VOLUME_DOWN) return { kind: 'step', delta: -VOLUME_KEY_STEP_PERCENT }
  if (appCommand === APPCOMMAND_VOLUME_MUTE) return { kind: 'toggle-mute' }
  return null
}

module.exports = {
  HSHELL_APPCOMMAND,
  APPCOMMAND_VOLUME_MUTE,
  APPCOMMAND_VOLUME_DOWN,
  APPCOMMAND_VOLUME_UP,
  VOLUME_KEY_STEP_PERCENT,
  shellHookAppCommand,
  volumeKeyAction,
}
