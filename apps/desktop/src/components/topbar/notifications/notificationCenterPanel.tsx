import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, ChevronDown, Settings, X } from "lucide-react";
import { useDarkText, useTopbarBg } from "../../themeContext";
import { useNotifications } from "../../../hooks/useNotifications";

function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}

interface RowColors {
    text: string;
    dim: string;
    rowHover: string;
    darkText: boolean;
}

export default function NotificationCenterPanel() {
    const darkText = useDarkText();
    const bg = useTopbarBg();
    const { items, config, dismiss, clearAll, setDnd, runAction } = useNotifications();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const offShow = window.shell?.notifications?.onCenterShow?.(() => setOpen(true));
        const offHide = window.shell?.notifications?.onCenterHide?.(() => setOpen(false));
        return () => { offShow?.(); offHide?.(); };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") window.shell?.notifications?.closeCenter?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const text = darkText ? "black" : "white";
    const dim = darkText ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
    const border = darkText ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)";
    const rowHover = darkText ? "hover:bg-black/5" : "hover:bg-white/10";
    const colors: RowColors = { text, dim, rowHover, darkText };

    const groups = useMemo(() => {
        if (!config.groupBySource) return [{ label: null as string | null, items }];
        const map = new Map<string, AppNotification[]>();
        for (const n of items) {
            const arr = map.get(n.appName) || [];
            arr.push(n);
            map.set(n.appName, arr);
        }
        return [...map.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
    }, [items, config.groupBySource]);

    if (!open) return null;

    return createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
            <div style={{ position: "absolute", inset: 0 }} onClick={() => window.shell?.notifications?.closeCenter?.()} />
            <div
                className="absolute flex flex-col rounded-xl shadow-2xl overflow-hidden"
                style={{ top: 28, right: 6, width: 360, maxHeight: "78vh", backgroundColor: bg, border: `1px solid ${border}`, color: text }}
            >
                <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: `1px solid ${border}` }}>
                    <span className="text-sm font-semibold">Notifications</span>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: dim }}>
                            <input type="checkbox" checked={config.doNotDisturb} onChange={(e) => setDnd(e.target.checked)} />
                            Do Not Disturb
                        </label>
                        <button onClick={() => window.shell?.windows?.openSettings?.()} aria-label="Notification settings" className="cursor-pointer" style={{ color: dim }}>
                            <Settings size={14} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12" style={{ color: dim }}>
                            <Bell size={22} />
                            <span className="text-sm">No notifications</span>
                        </div>
                    ) : (
                        groups.map((group, gi) => (
                            <Group key={group.label ?? gi} label={group.label} items={group.items} colors={colors} onDismiss={dismiss} onAction={runAction} />
                        ))
                    )}
                </div>

                {items.length > 0 && (
                    <div className="px-3 py-2" style={{ borderTop: `1px solid ${border}` }}>
                        <button onClick={clearAll} className="text-[12px] cursor-pointer" style={{ color: dim }}>Clear all</button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

interface GroupProps {
    label: string | null;
    items: AppNotification[];
    colors: RowColors;
    onDismiss: (id: number) => void;
    onAction: (id: number, actionId: string) => void;
}

function Group({ label, items, colors, onDismiss, onAction }: GroupProps) {
    const [collapsed, setCollapsed] = useState(false);
    return (
        <div>
            {label && (
                <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center justify-between px-3 pt-2 pb-1 cursor-pointer" style={{ color: colors.dim }}>
                    <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
                    <ChevronDown size={13} style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 150ms" }} />
                </button>
            )}
            {!collapsed && items.map((n) => (
                <Row key={n.id} n={n} colors={colors} onDismiss={onDismiss} onAction={onAction} />
            ))}
        </div>
    );
}

interface RowProps {
    n: AppNotification;
    colors: RowColors;
    onDismiss: (id: number) => void;
    onAction: (id: number, actionId: string) => void;
}

function Row({ n, colors, onDismiss, onAction }: RowProps) {
    const { text, dim, rowHover, darkText } = colors;
    return (
        <div className={`group flex items-start gap-2.5 px-3 py-2 ${rowHover} transition-colors`}>
            {n.icon ? <img src={n.icon} alt="" className="w-4 h-4 mt-0.5 rounded-sm shrink-0" draggable={false} /> : <span className="w-4 shrink-0" />}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] truncate" style={{ color: dim }}>{n.appName} · {relativeTime(n.timestamp)}</span>
                    <button onClick={() => onDismiss(n.id)} aria-label="Dismiss" className="shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" style={{ color: dim }}>
                        <X size={12} />
                    </button>
                </div>
                {n.title && <span className="text-[13px] font-medium leading-tight" style={{ color: text }}>{n.title}</span>}
                {n.body && <span className="text-[12px] leading-snug whitespace-pre-wrap break-words" style={{ color: dim }}>{n.body}</span>}
                {n.actions && n.actions.length > 0 && (
                    <div className="flex gap-2 mt-1.5">
                        {n.actions.map((a) => (
                            <button
                                key={a.id}
                                onClick={() => onAction(n.id, a.id)}
                                className="text-[12px] px-2 py-0.5 rounded cursor-pointer transition-colors"
                                style={{ backgroundColor: darkText ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)", color: text }}
                            >
                                {a.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
