const ENSURE_SHELL_REGISTRATION = 'ensure-shell-registration'
const EXIT_ALPINE = 'exit-alpine'

const REVERT_BLOCKED_IN_DEVELOPMENT = 'development'
const REVERT_BLOCKED_BY_UPDATE = 'update-in-progress'
const REVERT_BLOCKED_IN_TEST_SESSION = 'test-session'
const REVERT_BLOCKED_WITHOUT_TEST_SESSION = 'no-test-session'

function idlePlan(shellRegisteredToAlpine) {
  return { steps: [], actingAsShell: Boolean(shellRegisteredToAlpine) }
}

function previewPlan() {
  return { steps: [], actingAsShell: true }
}

function claimPlan(context) {
  return {
    steps: [ENSURE_SHELL_REGISTRATION],
    actingAsShell: !context.gpoBlocked || Boolean(context.shellRegisteredToAlpine),
  }
}

function planShellActivation(context) {
  if (!context.packaged) {
    return context.forceTakeover ? previewPlan() : idlePlan(context.shellRegisteredToAlpine)
  }
  if (context.optedOut) return idlePlan(context.shellRegisteredToAlpine)
  if (context.updateInProgress) return idlePlan(context.shellRegisteredToAlpine)
  if (context.handedToExplorer) return idlePlan(false)
  if (context.firstRun && !context.shellRegisteredToAlpine) return previewPlan()
  return claimPlan(context)
}

function requiresShellRegistration(plan) {
  return plan.steps.includes(ENSURE_SHELL_REGISTRATION)
}

function isRegistrationSatisfied(plan, registrationVerified) {
  return !requiresShellRegistration(plan) || Boolean(registrationVerified)
}

function revertBlockedReason({ packaged, updatePending, testSession = false, endsTestSession = false }) {
  if (!packaged) return REVERT_BLOCKED_IN_DEVELOPMENT
  if (updatePending) return REVERT_BLOCKED_BY_UPDATE
  if (testSession && !endsTestSession) return REVERT_BLOCKED_IN_TEST_SESSION
  if (!testSession && endsTestSession) return REVERT_BLOCKED_WITHOUT_TEST_SESSION
  return null
}

function planAutostartLaunch(context) {
  const explorerKeepsTheShell = context.packaged
    && context.launchedByAutostart
    && (context.handedOffThisLogon === true || context.updateInProgress === true)
    && context.explorerHostsShell === true
  return { steps: explorerKeepsTheShell ? [EXIT_ALPINE] : [] }
}

function shouldProcessAutostart(context) {
  return !context.development
    && !context.updateRestart
    && Boolean(context.actingAsShell)
    && !context.launchedByAutostart
    && context.ranThisLogon !== true
}

function matchHandoffLogon({ recordedLogonId, currentLogonId }) {
  if (!recordedLogonId || !currentLogonId) return null
  return recordedLogonId === currentLogonId
}

function updateHandsShellBackToAlpine({ previousShell, optedOut }) {
  if (optedOut) return false
  const shell = typeof previousShell === 'string' ? previousShell.trim() : ''
  return shell !== '' && !shell.toLowerCase().includes('explorer.exe')
}

function planShellRevert({ shellHandedToExplorer, replacementConfirmed }) {
  return { steps: shellHandedToExplorer && replacementConfirmed ? [EXIT_ALPINE] : [] }
}

function settleShellRevert(result, replacementConfirmed) {
  if (!result.success || replacementConfirmed) return result
  return { ...result, ...result.abandonHandoff() }
}

function planMarkerAge({ ageMs, maxAgeMs, systemUptimeMs = null }) {
  if (ageMs === null) return { active: false, restamp: false }
  if (ageMs < 0) return { active: true, restamp: true }
  if (systemUptimeMs !== null && ageMs > systemUptimeMs) return { active: false, restamp: false }
  return { active: ageMs < maxAgeMs, restamp: false }
}

module.exports = {
  ENSURE_SHELL_REGISTRATION,
  EXIT_ALPINE,
  REVERT_BLOCKED_IN_DEVELOPMENT,
  REVERT_BLOCKED_BY_UPDATE,
  REVERT_BLOCKED_IN_TEST_SESSION,
  REVERT_BLOCKED_WITHOUT_TEST_SESSION,
  planShellActivation,
  requiresShellRegistration,
  isRegistrationSatisfied,
  revertBlockedReason,
  planAutostartLaunch,
  shouldProcessAutostart,
  matchHandoffLogon,
  updateHandsShellBackToAlpine,
  planShellRevert,
  settleShellRevert,
  planMarkerAge,
}
