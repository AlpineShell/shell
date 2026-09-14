const net = require('net')

const QUIT_COMMAND = 'quit'

function containsQuitCommand(chunk) {
  return String(chunk).split(/\r?\n/).some((line) => line.trim() === QUIT_COMMAND)
}

function listenForLauncherQuit({ pipePath, quit, connect = net.connect }) {
  if (!pipePath) return null
  const socket = connect(pipePath)
  socket.setEncoding('utf8')
  socket.on('data', (chunk) => {
    if (containsQuitCommand(chunk)) quit()
  })
  socket.on('error', (error) => console.error('[dev] launcher control pipe error:', error.message))
  return socket
}

module.exports = { QUIT_COMMAND, containsQuitCommand, listenForLauncherQuit }
