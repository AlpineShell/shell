const path = require('path')

function appPathArguments(argv, runsFromSource) {
  if (!runsFromSource) return []
  const appPath = Array.isArray(argv) ? argv[1] : null
  if (typeof appPath !== 'string' || !appPath) return []
  return [path.resolve(appPath)]
}

function launchCommand({ execPath, argv, runsFromSource }) {
  return { target: execPath, args: appPathArguments(argv, runsFromSource) }
}

function openCommand(launch, url) {
  return { target: launch.target, args: [...launch.args, url] }
}

module.exports = { launchCommand, openCommand }
