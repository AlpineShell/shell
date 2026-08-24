const { exec, spawn } = require('child_process')

function runPowerShell(command) {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}"`,
      (err, stdout) => {
        if (err) {
          console.error(`[powershell] Command failed: ${command.substring(0, 80)}...`, err.message)
          return resolve('')
        }
        resolve(stdout.trim())
      }
    )
  })
}

const PERSISTENT_DELIM = '__PS_PERSISTENT_DONE__'
const DEFAULT_COMMAND_TIMEOUT_MS = 10000
const DEFAULT_IDLE_SHUTDOWN_MS = 60000

function spawnPersistentPowerShell() {
  return spawn('powershell', [
    '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', '-'
  ], { stdio: ['pipe', 'pipe', 'ignore'] })
}

function createPersistentRunner(spawnWorker = spawnPersistentPowerShell, commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, initScript = '') {
  let worker = null
  let outputBuffer = ''
  let active = null
  let watchdog = null
  const queue = []

  function resolveInitScript() {
    const value = typeof initScript === 'function' ? initScript() : initScript
    return value || ''
  }

  function clearWatchdog() {
    if (watchdog) {
      clearTimeout(watchdog)
      watchdog = null
    }
  }

  function settleActive(result) {
    if (!active) return
    const resolve = active.resolve
    active = null
    resolve(result)
  }

  function teardownWorker() {
    if (worker) {
      worker.removeAllListeners()
      worker.stdout.removeAllListeners()
      worker.stdin.removeAllListeners()
      try { worker.kill() } catch { void 0 }
      worker = null
    }
    outputBuffer = ''
  }

  function onWorkerExit() {
    clearWatchdog()
    teardownWorker()
    settleActive('')
    for (const item of queue.splice(0)) item.resolve('')
  }

  function onWorkerData(chunk) {
    outputBuffer += chunk.toString()
    let idx = outputBuffer.indexOf(PERSISTENT_DELIM)
    while (idx !== -1) {
      const result = outputBuffer.substring(0, idx).trim()
      outputBuffer = outputBuffer.substring(idx + PERSISTENT_DELIM.length).replace(/^\r?\n/, '')
      clearWatchdog()
      settleActive(result)
      processNext()
      idx = outputBuffer.indexOf(PERSISTENT_DELIM)
    }
  }

  function startWorker() {
    worker = spawnWorker()
    outputBuffer = ''
    worker.stdout.on('data', onWorkerData)
    worker.stdin.on('error', () => {})
    worker.on('exit', onWorkerExit)
    worker.stdin.write('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n')
    const init = resolveInitScript()
    if (init) worker.stdin.write(`${init}\n`)
  }

  function onWatchdogExpire() {
    teardownWorker()
    settleActive('')
    processNext()
  }

  function processNext() {
    if (active || queue.length === 0) return
    if (!worker || worker.exitCode !== null) {
      teardownWorker()
      startWorker()
    }
    active = queue.shift()
    watchdog = setTimeout(onWatchdogExpire, commandTimeoutMs)
    worker.stdin.write(`${active.command}\nWrite-Output '${PERSISTENT_DELIM}'\n`)
  }

  function run(command) {
    return new Promise((resolve) => {
      queue.push({ command, resolve })
      processNext()
    })
  }

  function warm() {
    if (!worker) startWorker()
  }

  function dispose() {
    clearWatchdog()
    teardownWorker()
    settleActive('')
    for (const item of queue.splice(0)) item.resolve('')
  }

  return { run, warm, dispose }
}


function createInteractiveRunner(
  spawnWorker = spawnPersistentPowerShell,
  commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  idleShutdownMs = DEFAULT_IDLE_SHUTDOWN_MS
) {
  const runner = createPersistentRunner(spawnWorker, commandTimeoutMs)
  let outstanding = 0
  let idleTimer = null

  function cancelIdleShutdown() {
    if (!idleTimer) return
    clearTimeout(idleTimer)
    idleTimer = null
  }

  function scheduleIdleShutdown() {
    cancelIdleShutdown()
    idleTimer = setTimeout(() => {
      idleTimer = null
      if (outstanding === 0) runner.dispose()
    }, idleShutdownMs)
  }

  async function run(command) {
    cancelIdleShutdown()
    outstanding += 1
    try {
      return await runner.run(command)
    } finally {
      outstanding -= 1
      if (outstanding === 0) scheduleIdleShutdown()
    }
  }

  function dispose() {
    cancelIdleShutdown()
    runner.dispose()
  }

  return { run, dispose }
}

module.exports = { runPowerShell, createPersistentRunner, createInteractiveRunner }
