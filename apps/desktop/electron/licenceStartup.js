const REASONS_WITHOUT_A_GENUINE_LICENCE = new Set(['missing', 'unreadable', 'unverifiable'])

function isUnlicensed(status) {
  return Boolean(status) && status.state === 'unlicensed'
}

function holdsAtSetup(status, context) {
  return Boolean(context.packaged)
    && isUnlicensed(status)
    && REASONS_WITHOUT_A_GENUINE_LICENCE.has(status.reason)
    && !context.desktopClaimedByAlpine
}

function planStartupForLicence(status, context) {
  const startShell = !holdsAtSetup(status, context)
  return {
    startShell,
    openSignIn: startShell && isUnlicensed(status),
  }
}

module.exports = { planStartupForLicence }
