function planStartupForLicence(status) {
  return {
    startShell: true,
    openSignIn: Boolean(status) && status.state === 'unlicensed',
  }
}

module.exports = { planStartupForLicence }
