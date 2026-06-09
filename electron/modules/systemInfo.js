const { execFile } = require('child_process')
const os = require('os')

function runPs(command) {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(null)
      try { resolve(JSON.parse(stdout.trim())) } catch { resolve(null) }
    })
  })
}

async function getOsInfo() {
  const data = await runPs(
    "Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber | ConvertTo-Json -Compress"
  )
  if (!data) return { name: 'Windows', version: '', build: '' }
  const caption = (data.Caption || '').replace(/^Microsoft /, '').trim()
  return { name: caption, version: data.Version || '', build: String(data.BuildNumber || '') }
}

async function getDisks() {
  const data = await runPs(
    "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID, Size, FreeSpace, VolumeName | ConvertTo-Json -Compress"
  )
  if (!data) return []
  const list = Array.isArray(data) ? data : [data]
  return list
    .filter((d) => d && d.Size)
    .map((d) => {
      const size = Number(d.Size)
      const free = Number(d.FreeSpace || 0)
      return {
        letter: (d.DeviceID || '').replace(':', ''),
        label: d.VolumeName || '',
        total: size,
        used: size - free,
        free,
      }
    })
}

async function getCpu() {
  const data = await runPs(
    "Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfCores, NumberOfLogicalProcessors | ConvertTo-Json -Compress"
  )
  if (!data) return { name: '', cores: 0, threads: 0 }
  return {
    name: (data.Name || '').replace(/\s+/g, ' ').trim(),
    cores: Number(data.NumberOfCores || 0),
    threads: Number(data.NumberOfLogicalProcessors || 0),
  }
}

async function getGpu() {
  const data = await runPs(
    "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress"
  )
  if (!data) return { name: '' }
  const list = Array.isArray(data) ? data : [data]
  const best = list
    .filter((g) => g && g.Name)
    .sort((a, b) => Number(b.AdapterRAM || 0) - Number(a.AdapterRAM || 0))[0]
  return { name: best ? best.Name : '' }
}

function getMemory() {
  const total = os.totalmem()
  const free = os.freemem()
  return { total, used: total - free, free }
}

async function getSystemInfo() {
  const [osInfo, disks, cpu, gpu] = await Promise.all([getOsInfo(), getDisks(), getCpu(), getGpu()])
  return {
    computerName: os.hostname(),
    user: os.userInfo().username,
    os: osInfo,
    disks,
    cpu,
    gpu,
    memory: getMemory(),
    uptime: Math.floor(os.uptime()),
  }
}

module.exports = {
  handlers: {
    'system/info': () => getSystemInfo(),
  },
  start() {},
}
