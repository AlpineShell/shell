import { Component, useRef, useState, type ReactNode, type RefObject } from "react";
import { useDarkText } from "../themeContext";
import { useTrayIcons } from "../../hooks/useTrayIcons";
import { useTrayLayout } from "../../hooks/useTrayLayout";
import { useTrayDisplay } from "../../hooks/useTrayDisplay";
import { useTraySettings } from "../../hooks/useTraySettings";
import { composeTray } from "./tray/composeTray";
import { TrayCaretGlyph, TrayIconGlyph } from "./faces/trayFace";
import { TRAY_CARET_SLOT_CLASS, TRAY_CLUSTER_CLASS, TRAY_ICON_SLOT_CLASS } from "./faces/faceClasses";
import PopupMenu from "./shared/popupMenu";
import { rearmMenuRegion } from "./shared/menuRegion";

const DRAG_THRESHOLD = 5;
const DRAG_EXPAND_HEIGHT = 240;
const BAR_DROP_Y = 32;
const CARET_DROP_SLACK = 6;

type DragSource = "visible" | "overflow";
interface DragState {
    id: string;
    source: DragSource;
    el: HTMLElement;
    startX: number;
    startY: number;
    active: boolean;
    dropIndex: number;
    overHiddenIcons: boolean;
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

function isPointWithin(el: HTMLElement | null, x: number, y: number, verticalSlack = 0) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top - verticalSlack && y <= rect.bottom + verticalSlack;
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
    const overflowPanelRef = useRef<HTMLDivElement>(null);
    const iconRefs = useRef(new Map<string, HTMLButtonElement>());
    const dragRef = useRef<DragState | null>(null);

    const [dragId, setDragId] = useState<string | null>(null);
    const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
    const [overHiddenIcons, setOverHiddenIcons] = useState(false);

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
            overHiddenIcons: false,
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
            if (s.source === "visible") window.topbar?.setActiveRegion?.({ top: 0, bottom: DRAG_EXPAND_HEIGHT, left: 0, right: window.innerWidth });
        }
        s.lastX = e.clientX;
        s.lastY = e.clientY;
        s.dropIndex = computeDropIndex(e.clientX);
        s.overHiddenIcons =
            s.source === "visible" &&
            (isPointWithin(caretRef.current, e.clientX, e.clientY, CARET_DROP_SLACK) || isPointWithin(overflowPanelRef.current, e.clientX, e.clientY));
        setDragPos({ x: e.clientX, y: e.clientY });
        setOverHiddenIcons(s.overHiddenIcons);
    }

    function onPointerUp() {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        const s = dragRef.current;
        dragRef.current = null;
        setDragId(null);
        setDragPos(null);
        setOverHiddenIcons(false);
        if (!s) return;
        if (!s.active) {
            clickTray(s.id, "left", s.el);
            return;
        }
        if (s.source === "visible") {
            rearmMenuRegion();
            if (s.overHiddenIcons) hideIcon(s.id);
            else reorderTo(s.id, s.dropIndex);
        } else if (s.lastY <= BAR_DROP_Y) {
            showIcon(s.id);
        }
    }

    const draggedIcon = dragId ? visible.find((i) => i.id === dragId) || overflow.find((i) => i.id === dragId) : null;

    return (
        <div ref={containerRef} className={TRAY_CLUSTER_CLASS}>
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
                    className={`${TRAY_ICON_SLOT_CLASS} cursor-pointer transition-opacity ${dragId === icon.id ? "opacity-30" : "hover:opacity-90"}`}
                >
                    <TrayIconGlyph src={icon.icon} />
                </button>
            ))}

            {showCaret && (
                <PopupMenu
                    trigger={
                        <div
                            ref={caretRef}
                            className={`${TRAY_CARET_SLOT_CLASS} transition-opacity ${overHiddenIcons ? (darkText ? "bg-black/20" : "bg-white/30") : "hover:opacity-60"}`}
                        >
                            <TrayCaretGlyph darkText={darkText} />
                        </div>
                    }
                >
                    <TrayOverflow panelRef={overflowPanelRef} icons={overflow} darkText={darkText} dragId={dragId} onIconPointerDown={onPointerDown} />
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
    panelRef,
    icons,
    darkText,
    dragId,
    onIconPointerDown,
}: {
    panelRef: RefObject<HTMLDivElement | null>;
    icons: TrayIcon[];
    darkText: boolean;
    dragId: string | null;
    onIconPointerDown: (e: React.PointerEvent, id: string, source: DragSource) => void;
}) {
    if (icons.length === 0) {
        return <div ref={panelRef} className={`px-4 py-3 text-xs ${darkText ? "text-black/50" : "text-white/50"}`}>No hidden icons</div>;
    }
    return (
        <div ref={panelRef} className="grid grid-cols-6 gap-1 p-2 max-w-56">
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
