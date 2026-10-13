import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Lock, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react"
import { launcherColors } from "../launcherColors"
import { MENU_LIST_CLASS, MenuDivider, SubToggle } from "./launcherMenu"
import { menuListMaxHeight } from "../launcherSizing"

function WifiSignalIcon({ signal, color, size }: { signal: number; color: string; size: number }) {
  if (signal >= 70) return <Wifi color={color} size={size} />
  if (signal >= 40) return <WifiHigh color={color} size={size} />
  if (signal >= 10) return <WifiLow color={color} size={size} />
  return <WifiZero color={color} size={size} />
}

export function WifiView({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const colors = launcherColors(darkText)
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [enabled, setEnabled] = useState(false)
  const [scanning, setScanning] = useState(true)
  const [selected, setSelected] = useState(0)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const itemCount = 1 + (enabled ? networks.length : 0)
  const current = Math.min(selected, itemCount - 1)

  const collectScan = useCallback(async () => {
    try {
      const found = await window.shell.network.wifiScan()
      if (found) setNetworks(found)
    } finally {
      setScanning(false)
    }
  }, [])

  const scan = useCallback(() => {
    setScanning(true)
    return collectScan()
  }, [collectScan])

  useEffect(() => {
    window.shell.network.wifiRadioGet().then((radio) => setEnabled(typeof radio?.state === "string" && radio.state.toLowerCase() === "on")).catch(() => {})
    window.shell.network.wifiNetworks().then(setNetworks).catch(() => {})
    const off = window.shell.network.onWifiScanUpdated((data) => { setNetworks(data); setScanning(false) })
    collectScan()
    return () => off()
  }, [collectScan])

  useEffect(() => {
    const element = listRef.current?.querySelector(`[data-idx="${current}"]`) as HTMLElement | null
    element?.scrollIntoView({ block: "nearest" })
  }, [current])

  function toggleRadio() {
    const next = !enabled
    setEnabled(next)
    setSelected(0)
    window.shell.network.wifiRadioSet(next).then(() => { if (next) scan() }).catch(() => {})
  }

  async function connect(network: WifiNetwork, secret?: string) {
    setConnecting(network.ssid)
    setError(false)
    const result = await window.shell.network.wifiConnect(network.ssid, secret)
    if (result.needsPassword && !secret) {
      setConnecting(null)
      setPasswordFor(network.ssid)
      setPassword("")
      requestAnimationFrame(() => passwordRef.current?.focus())
      return
    }
    setConnecting(null)
    if (!result.success) { setError(true); return }
    setPasswordFor(null)
    setPassword("")
    setTimeout(scan, 1200)
  }

  function activateNetwork(network: WifiNetwork) {
    if (connecting) return
    if (network.connected) { window.shell.network.wifiDisconnect().then(() => setTimeout(scan, 800)); return }
    if (passwordFor === network.ssid) { setPasswordFor(null); setPassword(""); return }
    connect(network)
  }

  function activate(index: number) {
    if (index === 0) { toggleRadio(); return }
    const network = networks[index - 1]
    if (network) activateNetwork(network)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (passwordFor) return
      if (event.key === "Escape" || event.key === "Backspace" || event.key === "ArrowLeft") { event.preventDefault(); onBack() }
      else if (event.key === "ArrowDown") { event.preventDefault(); setSelected(Math.min(current + 1, itemCount - 1)) }
      else if (event.key === "ArrowUp") { event.preventDefault(); setSelected(Math.max(current - 1, 0)) }
      else if (event.key === "Enter") { event.preventDefault(); activate(current) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div ref={listRef} className={`${MENU_LIST_CLASS} ${darkText ? "cc-scroll-light" : ""}`} style={{ maxHeight: menuListMaxHeight() }}>
      <button
        type="button"
        data-idx={0}
        onMouseMove={() => setSelected(0)}
        onClick={toggleRadio}
        className={`flex shrink-0 snap-start items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${current === 0 ? colors.selected : ""}`}
      >
        <Wifi size={18} className={`w-7 shrink-0 ${colors.dim}`} />
        <span className={`flex-1 text-[13px] ${colors.text}`}>Wi-Fi</span>
        <SubToggle on={enabled} darkText={darkText} />
      </button>

      {enabled && <MenuDivider darkText={darkText} />}

      {!enabled ? null : scanning && networks.length === 0 ? (
        <div className={`flex shrink-0 items-center justify-center py-4 ${colors.dim}`}><Loader2 size={18} className="animate-spin" /></div>
      ) : networks.length === 0 ? (
        <div className={`flex shrink-0 items-center gap-2 justify-center py-4 text-[13px] ${colors.dim}`}><WifiOff size={15} /><span>No networks</span></div>
      ) : (
        networks.map((network, offset) => {
          const index = offset + 1
          return (
            <div key={network.ssid} className="shrink-0">
              <button
                type="button"
                data-idx={index}
                onMouseMove={() => setSelected(index)}
                onClick={() => activateNetwork(network)}
                className={`w-full flex shrink-0 snap-start items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${index === current ? colors.selected : ""}`}
              >
                <span className="w-7 shrink-0 flex justify-center">
                  <WifiSignalIcon signal={network.signal} color={network.connected ? colors.iconStroke : colors.iconStrokeDim} size={16} />
                </span>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-[13px] truncate ${colors.text}`}>{network.ssid}</span>
                  {network.connected && <span className={`text-[11px] ${colors.dim}`}>Connected</span>}
                </div>
                {connecting === network.ssid && <Loader2 size={13} className={`shrink-0 animate-spin ${colors.dim}`} />}
                {network.security !== "Open" && <Lock size={12} className={`shrink-0 ${colors.dim}`} />}
              </button>
              {passwordFor === network.ssid && (
                <div className="flex gap-2 px-2.5 py-1.5 items-center">
                  <input
                    ref={passwordRef}
                    type="password"
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); setError(false) }}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === "Enter") { if (password.trim()) connect(network, password) }
                      else if (event.key === "Escape") { setPasswordFor(null); setPassword("") }
                    }}
                    placeholder="Password"
                    autoFocus
                    className={`flex-1 text-[13px] px-2 py-1 rounded-md outline-none ${darkText ? "bg-black/5 text-black placeholder:text-black/30" : "bg-white/10 text-white placeholder:text-white/30"} ${error ? "ring-1 ring-red-400" : ""}`}
                  />
                  <button type="button" onClick={() => { if (password.trim()) connect(network, password) }} className={`text-[12px] px-2 py-1 rounded-md cursor-pointer ${darkText ? "bg-black/10 text-black" : "bg-white/15 text-white"}`}>Join</button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
