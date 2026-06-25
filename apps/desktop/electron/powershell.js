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

function spawnPersistentPowerShell() {
  return spawn('powershell', [
    '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', '-'
  ], { stdio: ['pipe', 'pipe', 'ignore'] })
}

function createPersistentRunner(spawnWorker = spawnPersistentPowerShell, commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
  let worker = null
  let outputBuffer = ''
  let active = null
  let watchdog = null
  const queue = []

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
    worker.on('exit', onWorkerExit)
    worker.stdin.write('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n')
  }

  function onWatchdogExpire() {
    teardownWorker()
    settleActive('')
    processNext()
  }

  function processNext() {
    if (active || queue.length === 0) return
    if (!worker) startWorker()
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

  function dispose() {
    clearWatchdog()
    teardownWorker()
    settleActive('')
    for (const item of queue.splice(0)) item.resolve('')
  }

  return { run, dispose }
}

let persistentRunner = null

function runPersistent(command) {
  if (!persistentRunner) persistentRunner = createPersistentRunner()
  return persistentRunner.run(command)
}

module.exports = { runPowerShell, runPersistent, createPersistentRunner }
