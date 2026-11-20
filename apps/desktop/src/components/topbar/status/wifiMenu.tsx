import { useEffect, useRef } from "react";
import { ChevronLeft, EthernetPort, Loader2, Lock, Wifi, WifiHigh, WifiLow, WifiZero, WifiOff, RefreshCw } from "lucide-react";
import { useWifiJoin } from "../../../hooks/useWifiJoin";
import { ETHERNET_ONLY_TITLE, networkStatusLabel, wifiOffLabel } from "../../../lib/wifiPresentation";

function SignalIcon({ signal, color, size }: { signal: number; color: string; size: number }) {
    if (signal >= 70) return <Wifi color={color} size={size} />;
    if (signal >= 40) return <WifiHigh color={color} size={size} />;
    if (signal >= 10) return <WifiLow color={color} size={size} />;
    return <WifiZero color={color} size={size} />;
}

interface WifiMenuProps {
    state: WifiState;
    onToggleRadio: (enabled: boolean) => void;
    onBack: () => void;
    darkText: boolean;
}

function ToggleSwitch({ checked, onChange, darkText }: { checked: boolean; onChange: (v: boolean) => void; darkText: boolean }) {
    const onColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)";
    const offColor = darkText ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.18)";
    const knobOn = darkText ? "rgb(255,255,255)" : "rgb(20,20,20)";
    const knobOff = darkText ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)";
    return (
        <button
            onClick={() => onChange(!checked)}
            className="relative shrink-0 cursor-pointer rounded-full transition-colors"
            style={{ width: 26, height: 14, backgroundColor: checked ? onColor : offColor }}
            aria-pressed={checked}
        >
            <span
                className="absolute top-0.5 rounded-full transition-all"
                style={{
                    width: 10,
                    height: 10,
                    left: checked ? 14 : 2,
                    backgroundColor: checked ? knobOn : knobOff,
                }}
            />
        </button>
    );
}

export default function WifiMenu({ state, onToggleRadio, onBack, darkText }: WifiMenuProps) {
    const { passwordFor, password, setPassword, username, setUsername, needsUsername, canSubmit, activate, submitPassword, connectAnyway, cancelPassword, wrongPasswordFor, untrustedServerFor } = useWifiJoin();
    const passwordRef = useRef<HTMLInputElement>(null);
    const enabled = state.radio === 'on';
    const networks = state.networks;
    const busy = state.operation !== null;

    useEffect(() => {
        void window.shell.network.wifiScan().catch(() => {});
    }, []);

    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";

    function scan() {
        void window.shell.network.wifiScan().catch(() => {});
    }

    return (
        <div className="p-3 flex flex-col gap-2 w-65">
            <div className="flex items-center justify-between mb-1">
                <div className={`flex items-center gap-2 cursor-pointer ${darkText ? "text-black" : "text-white"}`} onClick={onBack}>
                    <ChevronLeft color={color} size={16} />
                    <span className="text-sm font-medium">Wi-Fi</span>
                </div>
                {!state.blockedByEthernet && <div className="flex items-center gap-2.5">
                    <button onClick={scan} disabled={state.scanning || !enabled} className="cursor-pointer">
                        <RefreshCw color={dimColor} size={14} className={state.scanning ? "animate-spin" : ""} style={{ opacity: enabled ? 1 : 0.4 }} />
                    </button>
                    <div style={{ marginLeft: 4 }}>
                        <ToggleSwitch checked={enabled} onChange={onToggleRadio} darkText={darkText} />
                    </div>
                </div>}
            </div>

            {state.blockedByEthernet ? (
                <div className={`flex flex-col items-center gap-2 py-4 ${darkText ? "text-black/40" : "text-white/40"}`}>
                    <EthernetPort size={20} />
                    <span className="text-sm">{ETHERNET_ONLY_TITLE}</span>
                </div>
            ) : !enabled ? (
                <div className={`flex flex-col items-center gap-2 py-4 ${darkText ? "text-black/40" : "text-white/40"}`}>
                    {state.ethernet ? <EthernetPort size={20} /> : <WifiOff size={20} />}
                    <span className="text-sm">{wifiOffLabel(state)}</span>
                </div>
            ) : state.scanning && networks.length === 0 ? (
                <div className={`flex items-center justify-center py-6 ${darkText ? "text-black/40" : "text-white/40"}`}>
                    <Loader2 size={20} className="animate-spin" />
                </div>
            ) : networks.length === 0 ? (
                <div className={`flex items-center gap-2 py-4 justify-center text-sm ${darkText ? "text-black/40" : "text-white/40"}`}>
                    <WifiOff size={16} />
                    <span>No networks found</span>
                </div>
            ) : (
                <div className={`flex flex-col gap-0.5 overflow-y-auto min-h-0 max-h-[50vh] snap-y snap-proximity cc-scroll ${darkText ? "cc-scroll-light" : ""}`}>
                    {networks.map((network) => (
                        <div key={network.ssid} className="shrink-0">
                            <div
                                className={`flex shrink-0 snap-start items-center justify-between px-2 py-1.5 rounded-md cursor-pointer ${darkText ? "hover:bg-black/5" : "hover:bg-white/10"} transition-colors`}
                                onClick={() => {
                                    if (state.operation) return;
                                    if (passwordFor === network.ssid) cancelPassword();
                                    else void activate(network);
                                }}
                            >
                                <div className={`flex items-center gap-2.5 ${darkText ? "text-black" : "text-white"}`}>
                                    <SignalIcon signal={network.signal} color={network.connected ? color : dimColor} size={15} />
                                    <div className="flex flex-col">
                                        <span className={`text-[13px] ${network.connected ? "" : (darkText ? "text-black/70" : "text-white/70")}`}>{network.ssid}</span>
                                        {networkStatusLabel(network, state) && <span className={`text-[11px] -mt-0.5 ${darkText ? "text-black/50" : "text-white/50"}`}>{networkStatusLabel(network, state)}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {state.operation?.ssid === network.ssid && <Loader2 color={dimColor} size={12} className="animate-spin" />}
                                    {network.secured && <Lock color={dimColor} size={12} />}
                                </div>
                            </div>
                            {passwordFor === network.ssid && !network.connected && (
                                <div className="flex flex-col gap-1.5 px-2 py-1.5">
                                    {needsUsername && (
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    if (!busy && canSubmit) void (untrustedServerFor === network.ssid ? connectAnyway() : submitPassword());
                                                    else passwordRef.current?.focus();
                                                } else if (e.key === "Escape") {
                                                    cancelPassword();
                                                }
                                            }}
                                            placeholder="Username"
                                            autoFocus
                                            className={`w-full text-[13px] px-2 py-1 rounded-md outline-none ${darkText ? "bg-black/5 text-black placeholder:text-black/30" : "bg-white/10 text-white placeholder:text-white/30"} ${wrongPasswordFor === network.ssid ? "ring-1 ring-red-400" : ""}`}
                                        />
                                    )}
                                    <div className="flex gap-2 items-center">
                                        <input
                                            ref={passwordRef}
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    if (!busy && canSubmit) void (untrustedServerFor === network.ssid ? connectAnyway() : submitPassword());
                                                } else if (e.key === "Escape") {
                                                    cancelPassword();
                                                }
                                            }}
                                            placeholder="Password"
                                            autoFocus={!needsUsername}
                                            className={`flex-1 min-w-0 text-[13px] px-2 py-1 rounded-md outline-none ${darkText ? "bg-black/5 text-black placeholder:text-black/30" : "bg-white/10 text-white placeholder:text-white/30"} ${wrongPasswordFor === network.ssid ? "ring-1 ring-red-400" : ""}`}
                                        />
                                        {untrustedServerFor !== network.ssid && (
                                            <button
                                                type="button"
                                                disabled={busy || !canSubmit}
                                                onClick={() => { if (!busy && canSubmit) void submitPassword(); }}
                                                className={`text-[12px] px-2 py-1 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default ${darkText ? "bg-black/10 text-black hover:bg-black/15" : "bg-white/15 text-white hover:bg-white/20"} transition-colors`}
                                            >
                                                Join
                                            </button>
                                        )}
                                    </div>
                                    {untrustedServerFor === network.ssid && (
                                        <button
                                            type="button"
                                            disabled={busy || !canSubmit}
                                            onClick={() => { if (!busy && canSubmit) void connectAnyway(); }}
                                            className={`w-full text-[12px] px-2 py-1 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default ${darkText ? "bg-black/10 text-black hover:bg-black/15" : "bg-white/15 text-white hover:bg-white/20"} transition-colors`}
                                        >
                                            Connect anyway
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
