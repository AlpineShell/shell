const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const NOTICE_REPEAT_MS = DAY_MS
const NOTICE_ID = 'licence'
const NOTICE_TITLE = 'Licence needs attention'

function formatDate(iso) {
  const parsed = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(parsed)) return 'soon'
  return new Date(parsed).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function reasonMessage(status) {
  switch (status.reason) {
    case 'expired':
      return 'Alpine Shell could not renew its licence.'
    case 'device-unreadable':
      return "Alpine Shell could not confirm this PC's identity."
    case 'secret-unreadable':
      return 'Alpine Shell needs you to sign in again on this PC.'
    case 'moved':
      return `This licence was moved to ${status.movedTo || 'another PC'}.`
    case 'refunded':
      return 'This purchase was refunded.'
    case 'disputed':
      return 'The payment for this licence is being disputed.'
    case 'released':
      return 'This PC was signed out of its licence from your account.'
    case 'conflict':
      return 'This licence is in use on another copy of Alpine Shell.'
    case 'account-deleted':
      return 'The account that owns this licence was deleted.'
    case 'upgrade':
      return 'Alpine Shell now needs a licence.'
    default:
      return 'Alpine Shell could not confirm its licence.'
  }
}

function handBackDeadline(status) {
  const until = status.graceUntil ? Date.parse(status.graceUntil) : NaN
  if (!Number.isFinite(until)) return 'Sign in to keep using it.'
  return `It keeps working until ${formatDate(status.graceUntil)}, when Windows Explorer comes back unless you sign in.`
}

function graceNoticeMessage(status) {
  return `${reasonMessage(status)} ${handBackDeadline(status)}`
}

function createLicenceNotice({ show, openLicenceWindow, now = () => Date.now() }) {
  let lastShownAt = null
  let lastShownKey = null

  function noticeKey(status) {
    return `${status.reason}|${status.graceUntil}|${status.movedTo}`
  }

  function dueAgain(key) {
    if (lastShownAt === null || key !== lastShownKey) return true
    return now() - lastShownAt >= NOTICE_REPEAT_MS
  }

  function observe(status) {
    if (!status || status.state !== 'grace') return false
    const key = noticeKey(status)
    if (!dueAgain(key)) return false
    lastShownAt = now()
    lastShownKey = key
    show({
      id: NOTICE_ID,
      title: NOTICE_TITLE,
      message: graceNoticeMessage(status),
      timeoutMs: 0,
      confirm: { label: 'Sign in', cancelLabel: 'Not now', run: () => openLicenceWindow() },
    })
    return true
  }

  return { observe }
}

module.exports = {
  NOTICE_ID,
  NOTICE_TITLE,
  NOTICE_REPEAT_MS,
  graceNoticeMessage,
  createLicenceNotice,
}
