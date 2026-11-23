const RESTORE_POLL_MS = 20
const MAX_RESTORE_ATTEMPTS = 20

function didActivateWindow(setForegroundOk, hwnd, initialForeground, currentForeground) {
  if (currentForeground === hwnd) return true
  return setForegroundOk && currentForeground !== 0 && currentForeground !== initialForeground
}

function createWindowActivator(ops) {
  const scheduleRetry = ops.scheduleRetry || setTimeout
  const cancelRetry = ops.cancelRetry || clearTimeout
  const restorePollMs = ops.restorePollMs ?? RESTORE_POLL_MS
  const maxRestoreAttempts = ops.maxRestoreAttempts ?? MAX_RESTORE_ATTEMPTS

  let generation = 0
  let pendingRestore = null

  function clearPendingRestore() {
    if (!pendingRestore) return
    cancelRetry(pendingRestore.timer)
    pendingRestore = null
  }

  function tryDirectForeground(hwnd, initialForeground) {
    const ok = ops.setForegroundWindow(hwnd)
    ops.raiseWindowAsync(hwnd)
    return didActivateWindow(ok, hwnd, initialForeground, ops.getForegroundWindow())
  }

  function attachableThread(hwnd, myThread, excludedThread = 0) {
    if (!hwnd || ops.isHung(hwnd)) return 0
    const threadId = ops.windowThreadId(hwnd)
    return threadId && threadId !== myThread && threadId !== excludedThread ? threadId : 0
  }

  function tryAttachedForeground(hwnd, initialForeground) {
    const myThread = ops.currentThreadId()
    const foregroundThread = attachableThread(initialForeground, myThread)
    const targetThread = attachableThread(hwnd, myThread, foregroundThread)
    if (!foregroundThread && !targetThread) return false

    const attachedForeground = foregroundThread ? ops.attachThreadInput(foregroundThread, myThread, true) : false
    const attachedTarget = targetThread ? ops.attachThreadInput(targetThread, myThread, true) : false
    if (!attachedForeground && !attachedTarget) return false

    try {
      return tryDirectForeground(hwnd, initialForeground)
    } finally {
      if (attachedTarget) ops.attachThreadInput(targetThread, myThread, false)
      if (attachedForeground) ops.attachThreadInput(foregroundThread, myThread, false)
    }
  }

  function focusWindowNow(hwnd, { allowFallback = true } = {}) {
    const initialForeground = ops.getForegroundWindow()
    if (tryDirectForeground(hwnd, initialForeground)) return true
    if (tryAttachedForeground(hwnd, initialForeground)) return true
    if (!allowFallback || typeof ops.allowForegroundFallback !== 'function') return false
    const ok = ops.allowForegroundFallback(hwnd)
    return didActivateWindow(ok, hwnd, initialForeground, ops.getForegroundWindow())
  }

  function watchRestoreCompletion(hwnd, myGeneration, attemptsLeft) {
    const timer = scheduleRetry(() => {
      if (pendingRestore && pendingRestore.timer === timer) pendingRestore = null
      if (myGeneration !== generation) return
      if (!ops.isWindow(hwnd) || ops.isHung(hwnd)) return
      if (ops.isIconic(hwnd)) {
        if (attemptsLeft > 1) watchRestoreCompletion(hwnd, myGeneration, attemptsLeft - 1)
        return
      }
      if (ops.getForegroundWindow() !== hwnd) focusWindowNow(hwnd)
    }, restorePollMs)
    pendingRestore = { hwnd, timer }
  }

  function activateWindow(hwnd) {
    if (!hwnd || !ops.isWindow(hwnd)) {
      generation += 1
      clearPendingRestore()
      return 0
    }
    if (pendingRestore && pendingRestore.hwnd === hwnd && ops.isIconic(hwnd)) return generation
    generation += 1
    const myGeneration = generation
    clearPendingRestore()

    const wasIconic = ops.isIconic(hwnd)
    if (wasIconic) ops.showRestoreAsync(hwnd)
    focusWindowNow(hwnd, { allowFallback: !wasIconic })
    if (wasIconic || ops.isIconic(hwnd)) watchRestoreCompletion(hwnd, myGeneration, maxRestoreAttempts)
    return myGeneration
  }

  function ensureWindowFocused(hwnd, token) {
    if (!hwnd || !token || token !== generation) return false
    if (!ops.isWindow(hwnd) || ops.isHung(hwnd)) return false
    if (ops.isIconic(hwnd)) {
      if (!pendingRestore || pendingRestore.hwnd !== hwnd) watchRestoreCompletion(hwnd, token, maxRestoreAttempts)
      return false
    }
    if (ops.getForegroundWindow() === hwnd) return true
    return focusWindowNow(hwnd)
  }

  function currentActivationToken() {
    return generation
  }

  return { activateWindow, ensureWindowFocused, currentActivationToken }
}

module.exports = {
  RESTORE_POLL_MS,
  MAX_RESTORE_ATTEMPTS,
  didActivateWindow,
  createWindowActivator,
}
