import { useState } from 'react'

export function useWifiJoin() {
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [wrongPasswordFor, setWrongPasswordFor] = useState<string | null>(null)

  async function activate(network: WifiNetwork): Promise<void> {
    setPasswordFor(null)
    setPassword('')
    setWrongPasswordFor(null)

    if (network.connected) {
      await window.shell.network.wifiDisconnect()
      return
    }

    const result = await window.shell.network.wifiConnect(network.ssid)
    if (result.needsPassword) {
      setPasswordFor(network.ssid)
      setPassword('')
    }
    setWrongPasswordFor(result.error === 'wrong-password' ? network.ssid : null)
  }

  async function submitPassword(): Promise<void> {
    if (!passwordFor) return

    const result = await window.shell.network.wifiConnect(passwordFor, password)
    if (result.success) {
      setPasswordFor(null)
      setPassword('')
      setWrongPasswordFor(null)
      return
    }

    setWrongPasswordFor(result.error === 'wrong-password' ? passwordFor : null)
  }

  function cancelPassword(): void {
    setPasswordFor(null)
    setPassword('')
    setWrongPasswordFor(null)
  }

  return { passwordFor, password, setPassword, activate, submitPassword, cancelPassword, wrongPasswordFor }
}
