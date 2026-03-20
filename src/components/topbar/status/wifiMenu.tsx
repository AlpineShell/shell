import { useState } from "react";
import { ChevronLeft, Loader2, Lock, Wifi, WifiHigh, WifiLow, WifiZero, WifiOff, RefreshCw } from "lucide-react";

function SignalIcon({ signal, color, size }: { signal: number; color: string; size: number }) {
    if (signal >= 70) return <Wifi color={color} size={size} />;
    if (signal >= 40) return <WifiHigh color={color} size={size} />;
    if (signal >= 10) return <WifiLow color={color} size={size} />;
    return <WifiZero color={color} size={size} />;
}

interface WifiMenuProps {
    networks: WifiNetwork[];
    scanning: boolean;
    onScan: () => void;
    onBack: () => void;
    darkText: boolean;
}

export default function WifiMenu({ networks, scanning, onScan, onBack, darkText }: WifiMenuProps) {
    const [connecting, setConnecting] = useState<string | null>(null);
    const [passwordFor, setPasswordFor] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);

    const color = darkText ? "black" : "white";
    const dimColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";

    async function handleConnect(ssid: string, pwd?: string) {
        setConnecting(ssid);
        setError(false);
        const result = await window.shell.network.wifiConnect(ssid, pwd);
        if (result.needsPassword && !pwd) {
            setConnecting(null);
            setPasswordFor(ssid);
            setPassword("");
            return;
        }
        if (!result.success) {
            setConnecting(null);
            setError(true);
            return;
        }
        await new Promise((r) => setTimeout(r, 1500));
        setPasswordFor(null);
        setPassword("");
        setConnecting(null);
        onScan();
    }

    async function handleDisconnect() {
        await window.shell.network.wifiDisconnect();
        await new Promise((r) => setTimeout(r, 1000));
        onScan();
    }

    function handlePasswordSubmit(ssid: string) {
        if (!password.trim()) return;
        handleConnect(ssid, password);
    }

    return (
        <div className="p-3 flex flex-col gap-2 w-65">
            <div className="flex items-center justify-between mb-1">
                <div className={`flex items-center gap-2 cursor-pointer ${darkText ? "text-black" : "text-white"}`} onClick={onBack}>
                    <ChevronLeft color={color} size={16} />
                    <span className="text-sm font-medium">Wi-Fi</span>
                </div>
                <button onClick={onScan} disabled={scanning} className="cursor-pointer">
                    <RefreshCw color={dimColor} size={14} className={scanning ? "animate-spin" : ""} />
                </button>
            </div>

            {scanning && networks.length === 0 ? (
                <div className={`flex items-center justify-center py-6 ${darkText ? "text-black/40" : "text-white/40"}`}>
                    <Loader2 size={20} className="animate-spin" />
                </div>
            ) : networks.length === 0 ? (
                <div className={`flex items-center gap-2 py-4 justify-center text-sm ${darkText ? "text-black/40" : "text-white/40"}`}>
                    <WifiOff size={16} />
                    <span>No networks found</span>
                </div>
            ) : (
                <div className="flex flex-col gap-0.5 overflow-y-auto">
                    {networks.map((network) => (
                        <div key={network.ssid}>
                            <div
                                className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer ${darkText ? "hover:bg-black/5" : "hover:bg-white/10"} transition-colors`}
                                onClick={() => {
                                    if (connecting) return;
                                    if (network.connected) handleDisconnect();
                                    else if (passwordFor === network.ssid) { setPasswordFor(null); setPassword(""); }
                                    else handleConnect(network.ssid);
                                }}
                            >
                                <div className={`flex items-center gap-2.5 ${darkText ? "text-black" : "text-white"}`}>
                                    <SignalIcon signal={network.signal} color={network.connected ? color : dimColor} size={15} />
                                    <div className="flex flex-col">
                                        <span className={`text-[13px] ${network.connected ? "" : (darkText ? "text-black/70" : "text-white/70")}`}>{network.ssid}</span>
                                        {network.connected && <span className={`text-[11px] -mt-0.5 ${darkText ? "text-black/50" : "text-white/50"}`}>Connected</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {connecting === network.ssid && <Loader2 color={dimColor} size={12} className="animate-spin" />}
                                    {network.security !== "Open" && <Lock color={dimColor} size={12} />}
                                </div>
                            </div>
                            {passwordFor === network.ssid && (
                                <div className={`flex gap-2 px-2 py-1.5 items-center`}>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setError(false); }}
                                        onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(network.ssid); }}
                                        placeholder="Password"
                                        autoFocus
                                        className={`flex-1 text-[13px] px-2 py-1 rounded-md outline-none ${darkText ? "bg-black/5 text-black placeholder:text-black/30" : "bg-white/10 text-white placeholder:text-white/30"} ${error ? "ring-1 ring-red-400" : ""}`}
                                    />
                                    <button
                                        onClick={() => handlePasswordSubmit(network.ssid)}
                                        className={`text-[12px] px-2 py-1 rounded-md cursor-pointer ${darkText ? "bg-black/10 text-black hover:bg-black/15" : "bg-white/15 text-white hover:bg-white/20"} transition-colors`}
                                    >
                                        Join
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
