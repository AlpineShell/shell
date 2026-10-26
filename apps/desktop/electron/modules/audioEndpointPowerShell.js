const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const { parseAudioDevices } = require('./audioDevices')

const DELIM = '__AUDIO_DONE__'

let ps = null
let psReady = null
let pendingResolve = null
let outputBuf = ''
let commandQueue = []
let busy = false

function audioScriptPath() {
  const { app } = require('electron')
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'audio.ps1')
    : path.join(__dirname, '..', 'scripts', 'audio.ps1')
}

function start() {
  if (psReady) return psReady
  psReady = new Promise((resolveInit) => {
    ps = spawn('powershell', [
      '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', '-'
    ], { stdio: ['pipe', 'pipe', 'ignore'] })

    ps.stdout.on('data', (chunk) => {
      outputBuf += chunk.toString()
      const idx = outputBuf.indexOf(DELIM)
      if (idx !== -1) {
        const result = outputBuf.substring(0, idx).trim()
        outputBuf = outputBuf.substring(idx + DELIM.length).replace(/^\r?\n/, '')
        if (pendingResolve) {
          const r = pendingResolve
          pendingResolve = null
          r(result)
        }
      }
    })

    ps.on('exit', () => {
      console.error('[volume] PowerShell process exited unexpectedly')
      ps = null
      psReady = null
      busy = false
      if (pendingResolve) { pendingResolve(''); pendingResolve = null }
      for (const { resolve } of commandQueue) resolve('')
      commandQueue = []
    })

    const script = fs.readFileSync(audioScriptPath(), 'utf8')
    const switchIdx = script.indexOf('\nswitch')
    const typeDef = switchIdx > 0 ? script.substring(0, switchIdx) : script
    pendingResolve = () => { resolveInit(); processNext() }
    ps.stdin.write(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n${typeDef}\nWrite-Output '${DELIM}'\n`)
  })
  return psReady
}

function processNext() {
  if (commandQueue.length === 0) { busy = false; return }
  busy = true
  const { cmd, resolve } = commandQueue.shift()
  pendingResolve = (result) => {
    resolve(result)
    processNext()
  }
  ps.stdin.write(`${cmd}\nWrite-Output '${DELIM}'\n`)
}

async function runCmd(cmd) {
  await start()
  return new Promise((resolve) => {
    commandQueue.push({ cmd, resolve })
    if (!busy) processNext()
  })
}

function dropQueuedCommands(prefix) {
  commandQueue = commandQueue.filter(c => !c.cmd.startsWith(prefix))
}

function parseState(raw) {
  const [rawVolume, rawMute] = raw.trim().split('|')
  const volume = parseInt(rawVolume, 10)
  if (isNaN(volume)) throw new Error(`unreadable audio state: ${raw}`)
  return { volume, muted: rawMute === '1' }
}

async function getState() {
  return parseState(await runCmd('[Audio]::GetState()'))
}

async function setVolume(percent) {
  dropQueuedCommands('[Audio]::SetVolume')
  await runCmd(`[Audio]::SetVolume(${percent} / 100.0)`)
}

async function setMute(muted) {
  dropQueuedCommands('[Audio]::SetMute')
  await runCmd(`[Audio]::SetMute($${muted ? 'true' : 'false'})`)
}

async function stepVolume(deltaPercent) {
  return parseState(await runCmd(`[Audio]::StepVolume(${deltaPercent})`))
}

async function toggleMute() {
  return parseState(await runCmd('[Audio]::ToggleMute()'))
}

async function getPeak() {
  return parseFloat(await runCmd('[Math]::Round([Audio]::GetPeak(), 3)')) || 0
}

async function listDevices() {
  return parseAudioDevices(await runCmd('ConvertTo-Json -Compress -InputObject @([AudioDevices]::List())'))
}

async function setDefaultDevice(id) {
  return (await runCmd(`[AudioDevices]::SetDefault('${id}')`)).trim() === 'True'
}

module.exports = {
  kind: 'powershell',
  start,
  getState,
  setVolume,
  setMute,
  stepVolume,
  toggleMute,
  getPeak,
  listDevices,
  setDefaultDevice,
}
