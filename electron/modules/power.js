const { exec } = require('child_process')

function powerAction(action) {
  switch (action) {
    case 'shutdown':
      exec('shutdown /s /t 0')
      break
    case 'restart':
      exec('shutdown /r /t 0')
      break
    case 'logout':
      exec('shutdown /l')
      break
  }
}

module.exports = {
  handlers: {
    'system/power-action': (_event, action) => powerAction(action),
  },
}
