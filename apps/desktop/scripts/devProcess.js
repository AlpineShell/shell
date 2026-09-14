const { execFile } = require('child_process')

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    child.once('exit', onExit)
  })
}

function killProcessTree(pid, runFile = execFile) {
  return new Promise((resolve) => {
    runFile('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true }, () => resolve())
  })
}

async function stopProcessTree(child, { requestQuit, timeoutMs, killTree = killProcessTree }) {
  if (hasExited(child)) return 'exited'
  if (requestQuit(child) && (await waitForExit(child, timeoutMs))) return 'clean'
  await killTree(child.pid)
  await waitForExit(child, timeoutMs)
  return 'forced'
}

module.exports = { hasExited, waitForExit, killProcessTree, stopProcessTree }
