import { describe, it, expect } from 'vitest'
import appCommandPolicy from './appCommandPolicy.js'

const {
  HSHELL_APPCOMMAND,
  APPCOMMAND_VOLUME_MUTE,
  APPCOMMAND_VOLUME_DOWN,
  APPCOMMAND_VOLUME_UP,
  VOLUME_KEY_STEP_PERCENT,
  shellHookAppCommand,
  volumeKeyAction,
} = appCommandPolicy

const HSHELL_WINDOWACTIVATED = 4
const FAPPCOMMAND_KEY = 0x0000
const FAPPCOMMAND_MOUSE = 0x8000
const FAPPCOMMAND_OEM = 0x1000
const APPCOMMAND_MEDIA_PLAY_PAUSE = 14

function appCommandLParam(appCommand, device = FAPPCOMMAND_KEY, keyState = 0) {
  return ((appCommand | device) << 16) | keyState
}

describe('shellHookAppCommand', () => {
  it('reads the app command a volume key sends from the keyboard', () => {
    expect(shellHookAppCommand(HSHELL_APPCOMMAND, appCommandLParam(APPCOMMAND_VOLUME_UP))).toBe(APPCOMMAND_VOLUME_UP)
    expect(shellHookAppCommand(HSHELL_APPCOMMAND, appCommandLParam(APPCOMMAND_VOLUME_DOWN))).toBe(APPCOMMAND_VOLUME_DOWN)
    expect(shellHookAppCommand(HSHELL_APPCOMMAND, appCommandLParam(APPCOMMAND_VOLUME_MUTE))).toBe(APPCOMMAND_VOLUME_MUTE)
  })

  it('drops the device bits a mouse or OEM device sets', () => {
    expect(shellHookAppCommand(HSHELL_APPCOMMAND, appCommandLParam(APPCOMMAND_VOLUME_UP, FAPPCOMMAND_MOUSE))).toBe(APPCOMMAND_VOLUME_UP)
    expect(shellHookAppCommand(HSHELL_APPCOMMAND, appCommandLParam(APPCOMMAND_VOLUME_MUTE, FAPPCOMMAND_OEM))).toBe(APPCOMMAND_VOLUME_MUTE)
  })

  it('ignores the key state in the low word', () => {
    expect(shellHookAppCommand(HSHELL_APPCOMMAND, appCommandLParam(APPCOMMAND_VOLUME_DOWN, FAPPCOMMAND_KEY, 0x0004))).toBe(APPCOMMAND_VOLUME_DOWN)
  })

  it('reads an lParam that koffi hands over as a sign-extended bigint', () => {
    const signExtended = BigInt.asIntN(64, BigInt(appCommandLParam(APPCOMMAND_VOLUME_UP, FAPPCOMMAND_MOUSE)))
    expect(signExtended < 0n).toBe(true)
    expect(shellHookAppCommand(BigInt(HSHELL_APPCOMMAND), signExtended)).toBe(APPCOMMAND_VOLUME_UP)
  })

  it('returns null for every other shell hook event', () => {
    expect(shellHookAppCommand(HSHELL_WINDOWACTIVATED, appCommandLParam(APPCOMMAND_VOLUME_UP))).toBeNull()
  })
})

describe('volumeKeyAction', () => {
  it('steps the volume up and down by the Windows step', () => {
    expect(volumeKeyAction(APPCOMMAND_VOLUME_UP)).toEqual({ kind: 'step', delta: VOLUME_KEY_STEP_PERCENT })
    expect(volumeKeyAction(APPCOMMAND_VOLUME_DOWN)).toEqual({ kind: 'step', delta: -VOLUME_KEY_STEP_PERCENT })
    expect(VOLUME_KEY_STEP_PERCENT).toBe(2)
  })

  it('toggles mute on the mute key', () => {
    expect(volumeKeyAction(APPCOMMAND_VOLUME_MUTE)).toEqual({ kind: 'toggle-mute' })
  })

  it('leaves every other app command alone', () => {
    expect(volumeKeyAction(APPCOMMAND_MEDIA_PLAY_PAUSE)).toBeNull()
    expect(volumeKeyAction(null)).toBeNull()
  })
})
