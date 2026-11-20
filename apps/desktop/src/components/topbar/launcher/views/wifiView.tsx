import { useEffect, useRef, useState } from "react"
import { EthernetPort, Loader2, Lock, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from "lucide-react"
import { launcherColors } from "../launcherColors"
import { MENU_LIST_CLASS, MenuDivider, SubToggle } from "./launcherMenu"
import { menuListMaxHeight } from "../launcherSizing"
import { useWifi } from "../../../../hooks/useWifi"
import { useWifiJoin } from "../../../../hooks/useWifiJoin"
import { ETHERNET_ONLY_TITLE, networkStatusLabel, wifiOffLabel } from "../../../../lib/wifiPresentation"

function WifiSignalIcon({ signal, color, size }: { signal: number; color: string; size: number }) {
  if (signal >= 70) return <Wifi color={color} size={size} />
  if (signal >= 40) return <WifiHigh color={color} size={size} />
  if (signal >= 10) return <WifiLow color={color} size={size} />
  return <WifiZero color={color} size={size} />
}

export function WifiView({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const colors = launcherColors(darkText)
  const state = useWifi()
  const join = useWifiJoin()
  const enabled = state.radio === 'on'
  const networks = state.networks
  const [selected, setSelected] = useState(0)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const busy = state.operation !== null

  const itemCount = 1 + (enabled ? networks.length : 0)
  const current = Math.min(selected, itemCount - 1)

  useEffect(() => {
    void window.shell.network.wifiScan().catch(() => {})
  }, [])

  useEffect(() => {
    if (!join.passwordFor) return
    requestAnimationFrame(() => (join.needsUsername ? usernameRef : passwordRef).current?.focus())
  }, [join.passwordFor, join.needsUsername])

  useEffect(() => {
    const element = listRef.current?.querySelector(`[data-idx="${current}"]`) as HTMLElement | null
    element?.scrollIntoView({ block: "nearest" })
  }, [current])

  function toggleRadio() {
    const next = !enabled
    setSelected(0)
    void window.shell.network.wifiRadioSet(next).catch(() => {})
  }

  function activateNetwork(network: WifiNetwork) {
    if (state.operation) return
    if (join.passwordFor === network.ssid) join.cancelPassword()
    else void join.activate(network)
  }

  function activate(index: number) {
    if (state.blockedByEthernet) return
    if (index === 0) { toggleRadio(); return }
    const network = networks[index - 1]
    if (network) activateNetwork(network)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
       if (join.passwordFor) return
      if (event.key === "Escape" || event.key === "Backspace" || event.key === "ArrowLeft") { event.preventDefault(); onBack() }
      else if (event.key === "ArrowDown") { event.preventDefault(); setSelected(Math.min(current + 1, itemCount - 1)) }
      else if (event.key === "ArrowUp") { event.preventDefault(); setSelected(Math.max(current - 1, 0)) }
      else if (event.key === "Enter") { event.preventDefault(); activate(current) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (state.blockedByEthernet) {
    return (
      <div ref={listRef} className={`${MENU_LIST_CLASS} ${darkText ? "cc-scroll-light" : ""}`} style={{ maxHeight: menuListMaxHeight() }}>
        <div className={`flex shrink-0 items-center gap-2 justify-center py-4 text-[13px] ${colors.dim}`}>
          <EthernetPort size={15} className="shrink-0" />
          <span>{ETHERNET_ONLY_TITLE}</span>
        </div>
      </div>
    )
  }

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

      {!enabled ? (
        <div className={`flex shrink-0 items-center gap-2 justify-center py-4 text-[13px] ${colors.dim}`}>{state.ethernet ? <EthernetPort size={15} /> : <WifiOff size={15} />}<span>{wifiOffLabel(state)}</span></div>
      ) : state.scanning && networks.length === 0 ? (
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
                  {networkStatusLabel(network, state) && <span className={`text-[11px] ${colors.dim}`}>{networkStatusLabel(network, state)}</span>}
                </div>
                {state.operation?.ssid === network.ssid && <Loader2 size={13} className={`shrink-0 animate-spin ${colors.dim}`} />}
                {network.secured && <Lock size={12} className={`shrink-0 ${colors.dim}`} />}
              </button>
              {join.passwordFor === network.ssid && !network.connected && (
                <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
                  {join.needsUsername && (
                    <input
                      ref={usernameRef}
                      type="text"
                      value={join.username}
                      onChange={(event) => join.setUsername(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === "Enter") {
                          if (!busy && join.canSubmit) void (join.untrustedServerFor === network.ssid ? join.connectAnyway() : join.submitPassword())
                          else passwordRef.current?.focus()
                        } else if (event.key === "Escape") {
                          join.cancelPassword()
                        }
                      }}
                      placeholder="Username"
                      autoFocus
                      className={`w-full text-[13px] px-2 py-1 rounded-md outline-none ${darkText ? "bg-black/5 text-black placeholder:text-black/30" : "bg-white/10 text-white placeholder:text-white/30"} ${join.wrongPasswordFor === network.ssid ? "ring-1 ring-red-400" : ""}`}
                    />
                  )}
                  <div className="flex gap-2 items-center">
                    <input
                      ref={passwordRef}
                      type="password"
                      value={join.password}
                      onChange={(event) => join.setPassword(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === "Enter") { if (!busy && join.canSubmit) void (join.untrustedServerFor === network.ssid ? join.connectAnyway() : join.submitPassword()) }
                        else if (event.key === "Escape") join.cancelPassword()
                      }}
                      placeholder="Password"
                      autoFocus={!join.needsUsername}
                      className={`flex-1 min-w-0 text-[13px] px-2 py-1 rounded-md outline-none ${darkText ? "bg-black/5 text-black placeholder:text-black/30" : "bg-white/10 text-white placeholder:text-white/30"} ${join.wrongPasswordFor === network.ssid ? "ring-1 ring-red-400" : ""}`}
                    />
                    {join.untrustedServerFor !== network.ssid && (
                      <button
                        type="button"
                        disabled={busy || !join.canSubmit}
                        onClick={() => { if (!busy && join.canSubmit) void join.submitPassword() }}
                        className={`text-[12px] px-2 py-1 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default ${darkText ? "bg-black/10 text-black" : "bg-white/15 text-white"}`}
                      >
                        Join
                      </button>
                    )}
                  </div>
                  {join.untrustedServerFor === network.ssid && (
                    <button
                      type="button"
                      disabled={busy || !join.canSubmit}
                      onClick={() => { if (!busy && join.canSubmit) void join.connectAnyway() }}
                      className={`w-full text-[12px] px-2 py-1 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default ${darkText ? "bg-black/10 text-black" : "bg-white/15 text-white"}`}
                    >
                      Connect anyway
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
