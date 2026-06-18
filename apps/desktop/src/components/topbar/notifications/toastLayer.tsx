import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDarkText, useTopbarBg } from "../../themeContext";
import { useNotifications } from "../../../hooks/useNotifications";
import ToastChrome, { type ToastSurface } from "../chrome/ToastChrome";

const MAX_VISIBLE = 3;
const BAR_BOTTOM = 24;
const TOAST_WIDTH = 320;
const EDGE = 8;

type Anchor = "left" | "center" | "right";

function geometryFor(position: NotificationPosition) {
    const screenW = window.innerWidth;
    const half = TOAST_WIDTH / 2;
    if (position === "top-left") return { anchor: "left" as Anchor, left: EDGE, centerX: EDGE + half };
    if (position === "top-right") return { anchor: "right" as Anchor, left: screenW - EDGE - TOAST_WIDTH, centerX: screenW - EDGE - half };
    return { anchor: "center" as Anchor, left: Math.round(screenW / 2 - half), centerX: Math.round(screenW / 2) };
}

interface ActiveToast extends AppNotification { key: number }

let toastKeySeq = 1;

export default function ToastLayer() {
    const darkText = useDarkText();
    const bg = useTopbarBg();
    const { config, runAction } = useNotifications();
    const [toasts, setToasts] = useState<ActiveToast[]>([]);
    const [surface, setSurface] = useState<ToastSurface | null>(null);
    const clipRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const borderColor = darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";

    useEffect(() => {
        const off = window.shell?.notifications?.onPosted?.((n) => {
            setToasts((prev) => [{ ...n, key: toastKeySeq++ }, ...prev].slice(0, 12));
        });
        return () => off?.();
    }, []);

    const remove = (key: number) => setToasts((prev) => prev.filter((t) => t.key !== key));

    const visible = toasts.slice(0, MAX_VISIBLE);
    const overflow = toasts.length - visible.length;

    const measure = () => {
        const body = bodyRef.current;
        const clip = clipRef.current;
        if (!body || !clip || toasts.length === 0) {
            setSurface(null);
            window.topbar?.setToastRegion?.(null);
            return;
        }
        const geom = geometryFor(config.position);
        const fullHeight = body.offsetHeight;
        setSurface((prev) => {
            if (prev && prev.centerX === geom.centerX && prev.bodyWidth === TOAST_WIDTH && prev.fullHeight === fullHeight && prev.anchor === geom.anchor && prev.contentEl === clip) return prev;
            return { centerX: geom.centerX, bodyWidth: TOAST_WIDTH, fullHeight, anchor: geom.anchor, contentEl: clip };
        });
        window.topbar?.setToastRegion?.({
            top: BAR_BOTTOM,
            bottom: BAR_BOTTOM + fullHeight,
            left: geom.left,
            right: geom.left + TOAST_WIDTH,
        });
    };

    useLayoutEffect(() => {
        measure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toasts, config.position]);

    useEffect(() => {
        const body = bodyRef.current;
        if (!body || toasts.length === 0) return;
        const observer = new ResizeObserver(() => measure());
        observer.observe(body);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toasts.length === 0, config.position]);

    useEffect(() => () => { window.topbar?.setToastRegion?.(null); }, []);

    const text = darkText ? "black" : "white";
    const dim = darkText ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
    const geom = geometryFor(config.position);

    return (
        <>
            <ToastChrome barHeight={BAR_BOTTOM} bg={bg} borderColor={borderColor} surface={surface} />
            <div
                ref={clipRef}
                style={{
                    position: "fixed",
                    top: BAR_BOTTOM,
                    left: geom.left,
                    width: TOAST_WIDTH,
                    zIndex: 3,
                    pointerEvents: toasts.length ? "auto" : "none",
                    willChange: "clip-path",
                    color: text,
                }}
            >
                <div ref={bodyRef} className="flex flex-col py-1">
                    {visible.map((t, i) => (
                        <ToastCard
                            key={t.key}
                            toast={t}
                            darkText={darkText}
                            dim={dim}
                            text={text}
                            divider={i > 0 ? borderColor : null}
                            duration={config.defaultDuration}
                            onDismiss={() => remove(t.key)}
                            onAction={(actionId) => { runAction(t.id, actionId); remove(t.key); }}
                        />
                    ))}
                    {overflow > 0 && (
                        <div className="px-3 py-1 text-[11px]" style={{ color: dim, borderTop: `1px solid ${borderColor}` }}>
                            +{overflow} more
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

interface ToastCardProps {
    toast: AppNotification;
    darkText: boolean;
    dim: string;
    text: string;
    divider: string | null;
    duration: number;
    onDismiss: () => void;
    onAction: (actionId: string) => void;
}

function ToastCard({ toast, darkText, dim, text, divider, duration, onDismiss, onAction }: ToastCardProps) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        timerRef.current = setTimeout(onDismiss, Math.max(1500, duration));
        return () => clearTimeout(timerRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const arm = () => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(onDismiss, Math.max(1500, duration));
    };

    return (
        <div
            onMouseEnter={() => clearTimeout(timerRef.current)}
            onMouseLeave={arm}
            className="group flex items-start gap-2.5 px-3 py-2"
            style={{ borderTop: divider ? `1px solid ${divider}` : undefined }}
        >
            {toast.icon ? <img src={toast.icon} alt="" className="w-4 h-4 mt-0.5 rounded-sm shrink-0" draggable={false} /> : <span className="w-4 shrink-0" />}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] truncate" style={{ color: dim }}>{toast.appName}</span>
                    <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" style={{ color: dim }}>
                        <X size={11} />
                    </button>
                </div>
                {toast.title && <span className="text-[12px] font-medium leading-tight">{toast.title}</span>}
                {toast.body && <span className="text-[12px] leading-snug whitespace-pre-wrap break-words" style={{ color: dim }}>{toast.body}</span>}
                {toast.actions && toast.actions.length > 0 && (
                    <div className="flex gap-2 mt-1.5">
                        {toast.actions.map((a) => (
                            <button
                                key={a.id}
                                onClick={() => onAction(a.id)}
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
