import { useShellState } from './useShellState'

const initialStatus: LicenceStatus = {
  state: 'unlicensed',
  reason: null,
  email: null,
  licenceId: null,
  activationId: null,
  deviceName: null,
  activatedAt: null,
  deviceReadable: true,
  releaseBuild: false,
}

const idleProgress: LicenceSignInProgress = {
  phase: 'idle',
  userCode: null,
  verificationUri: null,
  outcome: null,
  error: null,
}

export function useLicence() {
  const status = useShellState<LicenceStatus>(initialStatus, window.licence.status, window.licence.onChanged)
  const signInProgress = useShellState<LicenceSignInProgress>(idleProgress, window.licence.signInState, window.licence.onSignInProgress)

  return {
    status,
    signInProgress,
    signIn: window.licence.signIn,
    cancelSignIn: window.licence.cancelSignIn,
    activate: window.licence.activate,
    openCheckout: window.licence.openCheckout,
    openAccount: window.licence.openAccount,
    release: window.licence.release,
  }
}
