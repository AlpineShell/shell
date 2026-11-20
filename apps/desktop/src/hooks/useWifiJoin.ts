import { useState } from 'react'

export function useWifiJoin() {
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [needsUsername, setNeedsUsername] = useState(false)
  const [wrongPasswordFor, setWrongPasswordFor] = useState<string | null>(null)
  const [untrustedServerFor, setUntrustedServerFor] = useState<string | null>(null)
  const [trustedServerFor, setTrustedServerFor] = useState<string | null>(null)

  const canSubmit = password.trim().length > 0 && (!needsUsername || username.trim().length > 0)

  function resetForm(): void {
    setPasswordFor(null)
    setPassword('')
    setUsername('')
    setNeedsUsername(false)
    setWrongPasswordFor(null)
    setUntrustedServerFor(null)
    setTrustedServerFor(null)
  }

  async function activate(network: WifiNetwork): Promise<void> {
    resetForm()

    if (network.connected) {
      await window.shell.network.wifiDisconnect()
      return
    }

    const result = await window.shell.network.wifiConnect(network.ssid)
    if (result.needsPassword) {
      setPasswordFor(network.ssid)
      setNeedsUsername(result.needsUsername === true)
    }
    setWrongPasswordFor(result.error === 'wrong-password' ? network.ssid : null)
  }

  function connectWithCredentials(ssid: string, trustServer: boolean): Promise<WifiConnectResult> {
    if (!needsUsername) return window.shell.network.wifiConnect(ssid, password)
    return window.shell.network.wifiConnect(ssid, password, { username, trustServer })
  }

  async function submitCredentials(trustServer: boolean): Promise<void> {
    if (!passwordFor || !canSubmit) return

    const ssid = passwordFor
    const result = await connectWithCredentials(ssid, trustServer)
    if (result.success) {
      resetForm()
      return
    }

    setUntrustedServerFor(result.error === 'untrusted-server' ? ssid : null)
    setWrongPasswordFor(result.error === 'wrong-password' ? ssid : null)
  }

  function submitPassword(): Promise<void> {
    return submitCredentials(trustedServerFor !== null && trustedServerFor === passwordFor)
  }

  function connectAnyway(): Promise<void> {
    if (!passwordFor || !canSubmit) return Promise.resolve()
    setTrustedServerFor(passwordFor)
    setUntrustedServerFor(null)
    return submitCredentials(true)
  }

  function cancelPassword(): void {
    resetForm()
  }

  return {
    passwordFor,
    password,
    setPassword,
    username,
    setUsername,
    needsUsername,
    canSubmit,
    activate,
    submitPassword,
    connectAnyway,
    cancelPassword,
    wrongPasswordFor,
    untrustedServerFor,
  }
}
