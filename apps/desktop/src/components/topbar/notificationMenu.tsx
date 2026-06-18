import { Bell, BellOff, Trash2, X } from "lucide-react";
import PopupMenu from "./shared/popupMenu";
import { useDarkText } from "../themeContext";
import { useNotifications } from "../../hooks/useNotifications";

function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function groupBySource(items: AppNotification[]): { label: string | null; items: AppNotification[] }[] {
    const map = new Map<string, AppNotification[]>();
    for (const n of items) {
        const arr = map.get(n.appName) || [];
        arr.push(n);
        map.set(n.appName, arr);
    }
    return [...map.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
}

export default function NotificationMenu() {
    const darkText = useDarkText();
    const { unreadCount, markAllRead } = useNotifications();
    const iconColor = darkText ? "black" : "white";

    return (
        <PopupMenu
            onOpen={markAllRead}
            trigger={
                <div className="relative flex items-center justify-center w-6 h-6">
                    <Bell size={14} color={iconColor} />
                    {unreadCount > 0 && (
                        <span
                            className="absolute top-0.5 right-0.5 min-w-3 h-3 px-0.5 flex items-center justify-center rounded-full text-[8px] font-semibold leading-none"
                            style={{ backgroundColor: "#ef4444", color: "white" }}
                        >
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </div>
            }
        >
            <NotificationCenter />
        </PopupMenu>
    );
}

function NotificationCenter() {
    const darkText = useDarkText();
    const { items, config, dismiss, clearAll, setDnd, runAction } = useNotifications();

    const text = darkText ? "black" : "white";
    const dim = darkText ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)";
    const border = darkText ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)";
    const hover = darkText ? "hover:bg-black/5" : "hover:bg-white/10";

    const groups = config.groupBySource ? groupBySource(items) : [{ label: null as string | null, items }];

    return (
        <div className="w-80 flex flex-col" style={{ color: text }}>
            <div className="flex items-center justify-between px-3 h-9 shrink-0" style={{ borderBottom: items.length ? `1px solid ${border}` : undefined }}>
                <span className="text-[13px] font-semibold">Notifications</span>
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={() => setDnd(!config.doNotDisturb)}
                        title={config.doNotDisturb ? "Do Not Disturb on" : "Do Not Disturb off"}
                        className="cursor-pointer"
                        style={{ color: config.doNotDisturb ? text : dim }}
                    >
                        <BellOff size={13} />
                    </button>
                    {items.length > 0 && (
                        <button onClick={clearAll} title="Clear all" className="cursor-pointer" style={{ color: dim }}>
                            <Trash2 size={13} />
                        </button>
                    )}
                </div>
            </div>

            {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10" style={{ color: dim }}>
                    <Bell size={20} />
                    <span className="text-[13px]">No notifications</span>
                </div>
            ) : (
                <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                    {groups.map((group, gi) => (
                        <div key={group.label ?? gi}>
                            {group.label && (
                                <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: dim }}>
                                    {group.label}
                                </div>
                            )}
                            {group.items.map((n) => (
                                <Row key={n.id} n={n} text={text} dim={dim} hover={hover} darkText={darkText} onDismiss={dismiss} onAction={runAction} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface RowProps {
    n: AppNotification;
    text: string;
    dim: string;
    hover: string;
    darkText: boolean;
    onDismiss: (id: number) => void;
    onAction: (id: number, actionId: string) => void;
}

function Row({ n, text, dim, hover, darkText, onDismiss, onAction }: RowProps) {
    return (
        <div className={`group flex items-start gap-2.5 px-3 py-2 ${hover} transition-colors`}>
            {n.icon ? <img src={n.icon} alt="" className="w-4 h-4 mt-0.5 rounded-sm shrink-0" draggable={false} /> : <span className="w-4 shrink-0" />}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] truncate" style={{ color: dim }}>{n.appName} · {relativeTime(n.timestamp)}</span>
                    <button onClick={() => onDismiss(n.id)} aria-label="Dismiss" className="shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" style={{ color: dim }}>
                        <X size={11} />
                    </button>
                </div>
                {n.title && <span className="text-[12px] font-medium leading-tight">{n.title}</span>}
                {n.body && <span className="text-[12px] leading-snug whitespace-pre-wrap break-words" style={{ color: dim }}>{n.body}</span>}
                {n.actions && n.actions.length > 0 && (
                    <div className="flex gap-2 mt-1.5">
                        {n.actions.map((a) => (
                            <button
                                key={a.id}
                                onClick={() => onAction(n.id, a.id)}
                                className="text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors"
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
