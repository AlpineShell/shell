const { exec } = require('child_process')
const os = require('os')

function runJson(cmd) {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -Command "${cmd}"`, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(null)
      try { resolve(JSON.parse(stdout.trim())) } catch { resolve(null) }
    })
  })
}

async function getOsInfo() {
  const data = await runJson(
    "Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber | ConvertTo-Json -Compress"
  )
  if (!data) return { name: 'Windows', version: '', build: '' }
  const caption = (data.Caption || '').replace(/^Microsoft /, '').trim()
  return { name: caption, version: data.Version || '', build: String(data.BuildNumber || '') }
}

async function getDisks() {
  const data = await runJson(
    "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID, Size, FreeSpace, VolumeName | ConvertTo-Json -Compress"
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

async function getSystemInfo() {
  const [osInfo, disks] = await Promise.all([getOsInfo(), getDisks()])
  return {
    computerName: os.hostname(),
    user: os.userInfo().username,
    os: osInfo,
    disks,
  }
}

module.exports = {
  handlers: {
    'system/info': () => getSystemInfo(),
  },
  start() {},
}
