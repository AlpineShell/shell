const { exec } = require('child_process')

function runPowerShell(command) {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "${command}"`,
      (err, stdout) => resolve(err ? '' : stdout.trim())
    )
  })
}

module.exports = { runPowerShell }
