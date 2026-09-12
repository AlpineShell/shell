function createWorkerChannel({ createWorker, label }) {
  let worker = null
  let unavailable = false
  let nextId = 0
  const pending = new Map()
  const draining = new Set()

  function settle(id, outcome) {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    clearTimeout(request.timer)
    request.resolve(outcome)
  }

  function settleAll(error) {
    for (const id of [...pending.keys()]) settle(id, { ok: false, error })
  }

  function forget(started, error) {
    if (started !== worker) return
    worker = null
    settleAll(error)
  }

  function attach(started) {
    started.on('message', (message) => {
      if (started !== worker) return
      settle(message.id, message.error ? { ok: false, error: message.error } : { ok: true, value: message.value })
    })
    started.on('error', (e) => forget(started, `worker-error: ${e?.message ?? e}`))
    started.on('exit', () => {
      draining.delete(started)
      forget(started, 'worker-exit')
    })
  }

  function ensureWorker() {
    if (worker) return worker
    if (unavailable || draining.size > 0) return null
    try {
      const started = createWorker()
      started.unref?.()
      attach(started)
      worker = started
    } catch (e) {
      unavailable = true
      console.error(`[${label}] worker unavailable:`, e?.message ?? e)
    }
    return worker
  }

  function drop(reason) {
    const dropped = worker
    if (!dropped) return
    worker = null
    draining.add(dropped)
    settleAll(reason)
    try {
      dropped.terminate().catch(() => {})
    } catch (e) {
      console.error(`[${label}] worker terminate failed:`, e?.message ?? e)
    }
  }

  function refusal() {
    return { ok: false, error: draining.size > 0 ? 'stuck' : 'unavailable' }
  }

  function request(message, timeoutMs) {
    const active = ensureWorker()
    if (!active) return Promise.resolve(refusal())
    const id = ++nextId
    return new Promise((resolve) => {
      const timer = setTimeout(() => drop('timeout'), timeoutMs)
      timer.unref?.()
      pending.set(id, { resolve, timer })
      try {
        active.postMessage({ ...message, id })
      } catch (e) {
        settle(id, { ok: false, error: e?.message ?? String(e) })
      }
    })
  }

  function isBusy() {
    return pending.size > 0 || draining.size > 0
  }

  function dispose() {
    drop('disposed')
  }

  return { request, isBusy, dispose }
}

module.exports = { createWorkerChannel }
