const { exec } = require('child_process')

function runPowerShell(command) {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "${command}"`,
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

module.exports = { runPowerShell }
