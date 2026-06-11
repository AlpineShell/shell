import { Component, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useDarkText } from "../themeContext";
import { useTrayIcons } from "../../hooks/useTrayIcons";
import { useTrayLayout } from "../../hooks/useTrayLayout";
import { useTrayDisplay } from "../../hooks/useTrayDisplay";
import { useTraySettings } from "../../hooks/useTraySettings";
import { composeTray } from "./tray/composeTray";
import PopupMenu from "./shared/popupMenu";

const DRAG_THRESHOLD = 5;
const DRAG_EXPAND_HEIGHT = 240;
const BAR_DROP_Y = 32;

type DragSource = "visible" | "overflow";
interface DragState {
    id: string;
    source: DragSource;
    el: HTMLElement;
    startX: number;
    startY: number;
    active: boolean;
    dropIndex: number;
    overCaret: boolean;
    lastX: number;
    lastY: number;
}

function screenAnchor(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
        x: Math.round((window.screenX + rect.left + rect.width / 2) * dpr),
        y: Math.round((window.screenY + rect.bottom) * dpr),
    };
}

function clickTray(id: string, button: "left" | "right", el: HTMLElement) {
    const { x, y } = screenAnchor(el);
    window.shell?.tray?.click?.(id, button, x, y);
}

const MY_DISPLAY_ID = Number(new URLSearchParams(window.location.search).get("displayId"));

class TrayErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch(error: unknown) {
        console.error("[SystemTray] render error:", error);
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}

export default function SystemTray() {
    return (
        <TrayErrorBoundary>
            <SystemTrayInner />
        </TrayErrorBoundary>
    );
}

function SystemTrayInner() {
    const darkText = useDarkText();
    const icons = useTrayIcons();
    const { layout, setLayout } = useTrayLayout();
    const { display } = useTrayDisplay();
    const { settings } = useTraySettings();

    const containerRef = useRef<HTMLDivElement>(null);
    const caretRef = useRef<HTMLDivElement>(null);
    const iconRefs = useRef(new Map<string, HTMLButtonElement>());
    const dragRef = useRef<DragState | null>(null);

    const [dragId, setDragId] = useState<string | null>(null);
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const [overCaret, setOverCaret] = useState(false);

    const { visible, overflow } = composeTray(icons, layout);
    const onPrimary = display.showOnAllMonitors || MY_DISPLAY_ID === display.primaryDisplayId;
    const showCaret = settings.showOverflow && (overflow.length > 0 || dragId !== null);

    if (!settings.enabled || !onPrimary || (visible.length === 0 && overflow.length === 0)) return null;

    function computeDropIndex(clientX: number) {
        let index = visible.length;
        for (let i = 0; i < visible.length; i++) {
            const el = iconRefs.current.get(visible[i].id);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (clientX < rect.left + rect.width / 2) {
                index = i;
                break;
            }
        }
        return index;
    }

    function reorderTo(id: string, index: number) {
        const visIds = visible.map((i) => i.id);
        const from = visIds.indexOf(id);
        if (from === -1) return;
        visIds.splice(from, 1);
        const target = from < index ? index - 1 : index;
        visIds.splice(target, 0, id);
        setLayout({ order: [...visIds, ...overflow.map((i) => i.id)], hidden: layout.hidden });
    }

    function hideIcon(id: string) {
        const hidden = layout.hidden.includes(id) ? layout.hidden : [...layout.hidden, id];
        setLayout({ order: [...visible.map((i) => i.id), ...overflow.map((i) => i.id)], hidden });
    }

    function showIcon(id: string) {
        const hidden = layout.hidden.filter((h) => h !== id);
        const visIds = visible.map((i) => i.id);
        const restOverflow = overflow.map((i) => i.id).filter((x) => x !== id);
        setLayout({ order: [...visIds, id, ...restOverflow], hidden });
    }

    function onPointerDown(e: React.PointerEvent, id: string, source: DragSource) {
        if (e.button !== 0) return;
        dragRef.current = {
            id,
            source,
            el: e.currentTarget as HTMLElement,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            dropIndex: 0,
            overCaret: false,
            lastX: e.clientX,
            lastY: e.clientY,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
    }

    function onPointerMove(e: PointerEvent) {
        const s = dragRef.current;
        if (!s) return;
        if (!s.active) {
            if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD) return;
            s.active = true;
            setDragId(s.id);
            if (s.source === "visible") window.topbar?.setHeight?.(DRAG_EXPAND_HEIGHT);
        }
        s.lastX = e.clientX;
        s.lastY = e.clientY;
        s.dropIndex = computeDropIndex(e.clientX);
        const c = caretRef.current;
        s.overCaret = !!c && (() => {
            const r = c.getBoundingClientRect();
            return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6;
        })();
        setDragPos({ x: e.clientX, y: e.clientY });
        setOverCaret(s.overCaret);
    }

    function onPointerUp() {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        const s = dragRef.current;
        dragRef.current = null;
        setDragId(null);
        setDragPos(null);
        setOverCaret(false);
        if (!s) return;
        if (!s.active) {
            clickTray(s.id, "left", s.el);
            return;
        }
        window.topbar?.setHeight?.(24);
        if (s.source === "visible") {
            if (s.overCaret) hideIcon(s.id);
            else reorderTo(s.id, s.dropIndex);
        } else if (s.lastY <= BAR_DROP_Y) {
            showIcon(s.id);
        }
    }

    const draggedIcon = dragId ? visible.find((i) => i.id === dragId) || overflow.find((i) => i.id === dragId) : null;

    return (
        <div ref={containerRef} className="flex items-center gap-0.5 self-stretch pr-2">
            {visible.map((icon) => (
                <button
                    key={icon.id}
                    ref={(el) => {
                        if (el) iconRefs.current.set(icon.id, el);
                        else iconRefs.current.delete(icon.id);
                    }}
                    title={icon.tooltip}
                    onPointerDown={(e) => onPointerDown(e, icon.id, "visible")}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        clickTray(icon.id, "right", e.currentTarget);
                    }}
                    className={`flex items-center justify-center w-4 h-5 cursor-pointer transition-opacity ${dragId === icon.id ? "opacity-30" : "hover:opacity-90"}`}
                >
                    {icon.icon ? <img src={icon.icon} alt="" className="w-3.5 h-3.5" draggable={false} /> : <div className="w-3 h-3 rounded-sm bg-white/20" />}
                </button>
            ))}

            {showCaret && (
                <PopupMenu
                    trigger={
                        <div
                            ref={caretRef}
                            className={`flex items-center justify-center w-4 h-5 rounded-full transition-opacity ${overCaret ? (darkText ? "bg-black/20" : "bg-white/30") : "hover:opacity-60"}`}
                        >
                            <ChevronDown size={12} color={darkText ? "black" : "white"} />
                        </div>
                    }
                >
                    <TrayOverflow icons={overflow} darkText={darkText} dragId={dragId} onIconPointerDown={onPointerDown} />
                </PopupMenu>
            )}

            {dragId && dragPos && draggedIcon?.icon && (
                <img
                    src={draggedIcon.icon}
                    alt=""
                    draggable={false}
                    className="w-3.5 h-3.5 pointer-events-none"
                    style={{ position: "fixed", left: dragPos.x - 7, top: dragPos.y - 7, zIndex: 50, opacity: 0.85 }}
                />
            )}
        </div>
    );
}

function TrayOverflow({
    icons,
    darkText,
    dragId,
    onIconPointerDown,
}: {
    icons: TrayIcon[];
    darkText: boolean;
    dragId: string | null;
    onIconPointerDown: (e: React.PointerEvent, id: string, source: DragSource) => void;
}) {
    if (icons.length === 0) {
        return <div className={`px-4 py-3 text-xs ${darkText ? "text-black/50" : "text-white/50"}`}>No hidden icons</div>;
    }
    return (
        <div className="grid grid-cols-6 gap-1 p-2 max-w-56">
            {icons.map((icon) => (
                <button
                    key={icon.id}
                    title={icon.tooltip}
                    onPointerDown={(e) => onIconPointerDown(e, icon.id, "overflow")}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        clickTray(icon.id, "right", e.currentTarget);
                    }}
                    className={`flex items-center justify-center w-8 h-8 rounded-md cursor-pointer transition-colors ${darkText ? "hover:bg-black/10" : "hover:bg-white/15"} ${dragId === icon.id ? "opacity-30" : ""}`}
                >
                    {icon.icon ? <img src={icon.icon} alt="" className="w-5 h-5" draggable={false} /> : <div className="w-4 h-4 rounded-sm bg-white/20" />}
                </button>
            ))}
        </div>
    );
}
