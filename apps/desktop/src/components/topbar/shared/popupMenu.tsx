import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTopbarBg, useFullscreenWindow } from "../../themeContext";
import { SHOULDER, RADIUS } from "../chrome/chromeShape";
import { setChromeSurface, clearChromeSurface, nextSurfaceId } from "../chrome/chromeStore";

const SCREEN_PAD = 6;
const BAR_BOTTOM = 24;
const CLOSE_MS = 300;

type Shape = { centerX: number; bodyWidth: number; bodyHeight: number; left: number };

let activeMenu: { close: () => void } | null = null;

interface PopupMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    onOpen?: () => void;
}

export default function PopupMenu({ trigger, children, onOpen }: PopupMenuProps) {
    const BG = useTopbarBg();
    const outline = useFullscreenWindow();

    const wrapperRef = useRef<HTMLDivElement>(null);
    const clipRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const [open, setOpen] = useState(false);
    const [shape, setShape] = useState<Shape | null>(null);

    const idRef = useRef(0);
    if (!idRef.current) idRef.current = nextSurfaceId();
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const suppressReset = useRef(false);

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    const selfRef = useRef<{ close: () => void } | null>(null);
    if (!selfRef.current) {
        selfRef.current = {
            close: () => {
                clearTimeout(closeTimer.current);
                clearTimeout(leaveTimer.current);
                suppressReset.current = true;
                setOpen(false);
                setShape(null);
            },
        };
    }

    useEffect(() => {
        if (open) onOpenRef.current?.();
    }, [open]);

    function measureShape(): Shape | null {
        const wrapper = wrapperRef.current;
        const body = bodyRef.current;
        if (!wrapper || !body) return null;
        body.style.width = "max-content";
        const rect = body.getBoundingClientRect();
        const bodyWidth = Math.round(rect.width);
        const bodyHeight = Math.round(rect.height);
        body.style.width = `${bodyWidth}px`;
        const triggerRect = wrapper.getBoundingClientRect();
        const center = triggerRect.left + triggerRect.width / 2;
        const half = bodyWidth / 2 + SHOULDER;
        const centerX = Math.round(Math.max(SCREEN_PAD + half, Math.min(center, window.innerWidth - SCREEN_PAD - half)));
        return { centerX, bodyWidth, bodyHeight, left: centerX - bodyWidth / 2 };
    }

    useLayoutEffect(() => {
        if (!open || shape) return;
        const next = measureShape();
        if (next) setShape(next);
    }, [open, shape]);

    useLayoutEffect(() => {
        if (!open || !shape) return;
        if (clipRef.current) clipRef.current.style.height = "0px";
        setChromeSurface({
            id: idRef.current,
            centerX: shape.centerX,
            bodyWidth: shape.bodyWidth,
            fullHeight: shape.bodyHeight,
            outline,
            contentEl: clipRef.current,
        });
        window.topbar.setActiveRegion({
            top: BAR_BOTTOM,
            bottom: BAR_BOTTOM + shape.bodyHeight,
            left: shape.centerX - shape.bodyWidth / 2 - SHOULDER,
            right: shape.centerX + shape.bodyWidth / 2 + SHOULDER,
        });
    }, [open, shape, outline]);

    useEffect(() => {
        if (!open || !shape) return;
        const body = bodyRef.current;
        if (!body) return;
        let prevH = body.offsetHeight;
        const observer = new ResizeObserver(() => {
            const next = measureShape();
            if (!next) return;
            if (Math.abs(next.bodyHeight - prevH) < 1 && Math.abs(next.bodyWidth - shape.bodyWidth) < 1) return;
            prevH = next.bodyHeight;
            setShape(next);
        });
        observer.observe(body);
        return () => observer.disconnect();
    }, [open, shape]);

    useEffect(() => {
        if (!open) return;
        const remove = window.topbar.onCloseMenus(() => triggerClose());
        return () => remove();
    }, [open]);

    useEffect(() => () => {
        clearTimeout(closeTimer.current);
        clearTimeout(leaveTimer.current);
        if (activeMenu === selfRef.current) activeMenu = null;
        clearChromeSurface(idRef.current);
    }, []);

    function triggerClose() {
        if (activeMenu === selfRef.current) activeMenu = null;
        clearChromeSurface(idRef.current);
        window.topbar.setActiveRegion(null);
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => {
            setOpen(false);
            setShape(null);
        }, CLOSE_MS);
    }

    function handleEnter() {
        clearTimeout(closeTimer.current);
        clearTimeout(leaveTimer.current);
        const other = activeMenu && activeMenu !== selfRef.current ? activeMenu : null;
        if (other) other.close();
        activeMenu = selfRef.current;
        if (open) return;
        const triggerRect = wrapperRef.current?.getBoundingClientRect();
        window.topbar.setActiveRegion({
            top: triggerRect ? triggerRect.bottom : BAR_BOTTOM,
            bottom: window.innerHeight,
            left: 0,
            right: window.innerWidth,
        });
        setShape(null);
        setOpen(true);
    }

    function handleLeave() {
        leaveTimer.current = setTimeout(() => triggerClose(), 80);
    }

    return (
        <div
            ref={wrapperRef}
            className="relative flex items-center self-stretch"
            style={{ backgroundColor: open ? BG : "transparent", transition: "background-color 120ms ease" }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
        >
            <div className="cursor-pointer">{trigger}</div>
            {open && createPortal(
                <div
                    ref={clipRef}
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
                    style={{
                        position: "fixed",
                        left: shape ? shape.left : -9999,
                        top: BAR_BOTTOM,
                        width: shape ? shape.bodyWidth : undefined,
                        overflow: "hidden",
                        borderRadius: `0 0 ${RADIUS}px ${RADIUS}px`,
                        zIndex: 5,
                        pointerEvents: shape ? "auto" : "none",
                    }}
                >
                    <div ref={bodyRef}>{children}</div>
                </div>,
                document.body
            )}
        </div>
    );
}
