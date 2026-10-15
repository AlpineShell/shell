const fs = require('fs')
const { exec, execFile, spawn } = require('child_process')

const POWERSHELL_SINGLE_QUOTES = /['\u2018\u2019\u201A\u201B]/g
const UTF8_BYTE_ORDER_MARK = '\uFEFF'

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(POWERSHELL_SINGLE_QUOTES, '$&$&')
}

function quotePowerShellLiteral(value) {
  return `'${escapePowerShellSingleQuoted(value)}'`
}

function writePowerShellScriptFile(filePath, script) {
  fs.writeFileSync(filePath, `${UTF8_BYTE_ORDER_MARK}${script}`, 'utf8')
}

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

const ELEVATION_DECLINED_EXIT_CODE = 1223

function elevatedLauncherCommand(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return [
    'try {',
    `$elevated = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'`,
    `} catch { exit ${ELEVATION_DECLINED_EXIT_CODE} }`,
    'exit $elevated.ExitCode',
  ].join(' ')
}

function elevatedOutcome(exitCode) {
  if (exitCode === 0) return { ok: true, declined: false }
  return { ok: false, declined: exitCode === ELEVATION_DECLINED_EXIT_CODE }
}

function runElevatedPowerShell(script) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', elevatedLauncherCommand(script)], { windowsHide: true }, (err) => {
      resolve(elevatedOutcome(err ? err.code : 0))
    })
  })
}

const DEFAULT_FILE_TIMEOUT_MS = 10000
const STDERR_EXCERPT_CHARS = 400

function powerShellFileArguments(scriptPath, args) {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args]
}

function runPowerShellFile(scriptPath, args = [], { timeoutMs = DEFAULT_FILE_TIMEOUT_MS, spawnProcess = spawn } = {}) {
  return new Promise((resolve) => {
    let settled = false
    let timer = null
    let stdout = ''
    let stderr = ''

    function finish(exitCode, timedOut) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout: stdout.trim(), stderr: stderr.trim().slice(0, STDERR_EXCERPT_CHARS), exitCode, timedOut })
    }

    let child
    try {
      child = spawnProcess('powershell.exe', powerShellFileArguments(scriptPath, args), { windowsHide: true })
    } catch (e) {
      stderr = e.message
      finish(null, false)
      return
    }

    timer = setTimeout(() => {
      try { child.kill() } catch { void 0 }
      finish(null, true)
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => { stdout += chunk })
    child.stderr?.on('data', (chunk) => { stderr += chunk })
    child.on('error', (e) => {
      stderr = stderr || e.message
      finish(null, false)
    })
    child.on('close', (code) => finish(code, false))
  })
}

const PERSISTENT_DELIM = '__PS_PERSISTENT_DONE__'
const DEFAULT_COMMAND_TIMEOUT_MS = 10000

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

module.exports = { runPowerShell, runPowerShellFile, runElevatedPowerShell, elevatedLauncherCommand, elevatedOutcome, createPersistentRunner, escapePowerShellSingleQuoted, quotePowerShellLiteral, writePowerShellScriptFile }
