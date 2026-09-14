const CTRL_C = '\x03'

const KEY_ACTIONS = {
  [CTRL_C]: 'quit',
  q: 'quit',
  r: 'restart',
  R: 'restartFresh',
}

const KEY_HELP = [
  { key: 'r', label: 'restart Electron' },
  { key: 'R', label: 'restart Vite + Electron with fresh deps' },
  { key: 'q', label: 'quit' },
]

const EFFECT_FOR_RESTART = {
  restart: 'restartElectron',
  restartFresh: 'restartViteAndElectron',
}

function actionForKey(key) {
  return Object.hasOwn(KEY_ACTIONS, key) ? KEY_ACTIONS[key] : null
}

function unchanged(state) {
  return { state, effect: null }
}

function nextLauncherState(state, event) {
  if (state === 'exiting') return unchanged(state)
  if (event === 'quit') return { state: 'exiting', effect: 'quit' }
  if (state === 'starting' && event === 'ready') return unchanged('running')
  if (state === 'running' && Object.hasOwn(EFFECT_FOR_RESTART, event)) {
    return { state: 'restarting', effect: EFFECT_FOR_RESTART[event] }
  }
  if (state === 'restarting' && event === 'restarted') return unchanged('running')
  return unchanged(state)
}

module.exports = { KEY_HELP, actionForKey, nextLauncherState }
