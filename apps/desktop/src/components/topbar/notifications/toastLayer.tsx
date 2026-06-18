import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDarkText, useTopbarBg } from "../../themeContext";
import { useNotifications } from "../../../hooks/useNotifications";

const MAX_VISIBLE = 3;
const TOP_OFFSET = 28;
const EDGE = 8;
const WIDTH = 320;

function containerStyle(position: NotificationPosition): CSSProperties {
    const base: CSSProperties = { position: "fixed", zIndex: 50, display: "flex", flexDirection: "column", gap: 8, width: WIDTH, pointerEvents: "none" };
    switch (position) {
        case "top-left": return { ...base, top: TOP_OFFSET, left: EDGE };
        case "top-right": return { ...base, top: TOP_OFFSET, right: EDGE };
        case "bottom-left": return { ...base, bottom: EDGE, left: EDGE };
        case "bottom-right": return { ...base, bottom: EDGE, right: EDGE };
        case "top-center":
        default: return { ...base, top: TOP_OFFSET, left: "50%", transform: "translateX(-50%)" };
    }
}

interface ActiveToast extends AppNotification { key: number }

let toastKeySeq = 1;

export default function ToastLayer() {
    const darkText = useDarkText();
    const bg = useTopbarBg();
    const { config, runAction } = useNotifications();
    const [toasts, setToasts] = useState<ActiveToast[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const off = window.shell?.notifications?.onPosted?.((n) => {
            setToasts((prev) => [{ ...n, key: toastKeySeq++ }, ...prev].slice(0, 12));
        });
        return () => off?.();
    }, []);

    const remove = (key: number) => setToasts((prev) => prev.filter((t) => t.key !== key));

    const visible = toasts.slice(0, MAX_VISIBLE);
    const overflow = toasts.length - visible.length;

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el || toasts.length === 0) {
            window.topbar?.setToastRegion?.(null);
            return;
        }
        const rect = el.getBoundingClientRect();
        window.topbar?.setToastRegion?.({
            top: Math.floor(rect.top),
            bottom: Math.ceil(rect.bottom),
            left: Math.floor(rect.left),
            right: Math.ceil(rect.right),
        });
    });

    useEffect(() => () => { window.topbar?.setToastRegion?.(null); }, []);

    if (toasts.length === 0) return null;

    const overflowColor = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    const overflowBorder = darkText ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)";

    return (
        <div ref={containerRef} style={containerStyle(config.position)}>
            {visible.map((t) => (
                <ToastCard
                    key={t.key}
                    toast={t}
                    bg={bg}
                    darkText={darkText}
                    duration={config.defaultDuration}
                    onDismiss={() => remove(t.key)}
                    onAction={(actionId) => { runAction(t.id, actionId); remove(t.key); }}
                />
            ))}
            {overflow > 0 && (
                <div
                    className="self-center text-[11px] px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: bg, color: overflowColor, border: `1px solid ${overflowBorder}`, pointerEvents: "auto" }}
                >
                    +{overflow} more
                </div>
            )}
        </div>
    );
}

interface ToastCardProps {
    toast: AppNotification;
    bg: string;
    darkText: boolean;
    duration: number;
    onDismiss: () => void;
    onAction: (actionId: string) => void;
}

function ToastCard({ toast, bg, darkText, duration, onDismiss, onAction }: ToastCardProps) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [entered, setEntered] = useState(false);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    useEffect(() => {
        timerRef.current = setTimeout(onDismiss, Math.max(1500, duration));
        return () => clearTimeout(timerRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const arm = () => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(onDismiss, Math.max(1500, duration));
    };

    const text = darkText ? "black" : "white";
    const dim = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    const border = darkText ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)";

    return (
        <div
            onMouseEnter={() => clearTimeout(timerRef.current)}
            onMouseLeave={arm}
            className="rounded-lg p-3 shadow-lg transition-all duration-200"
            style={{
                backgroundColor: bg,
                border: `1px solid ${border}`,
                color: text,
                pointerEvents: "auto",
                opacity: entered ? 1 : 0,
                transform: entered ? "translateY(0)" : "translateY(-8px)",
            }}
        >
            <div className="flex items-start gap-2.5">
                {toast.icon ? <img src={toast.icon} alt="" className="w-4 h-4 mt-0.5 rounded-sm shrink-0" draggable={false} /> : null}
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] truncate" style={{ color: dim }}>{toast.appName}</span>
                        <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 cursor-pointer" style={{ color: dim }}>
                            <X size={12} />
                        </button>
                    </div>
                    {toast.title && <span className="text-[13px] font-medium leading-tight">{toast.title}</span>}
                    {toast.body && <span className="text-[12px] leading-snug whitespace-pre-wrap break-words" style={{ color: dim }}>{toast.body}</span>}
                    {toast.actions && toast.actions.length > 0 && (
                        <div className="flex gap-2 mt-1.5">
                            {toast.actions.map((a) => (
                                <button
                                    key={a.id}
                                    onClick={() => onAction(a.id)}
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
        </div>
    );
}
