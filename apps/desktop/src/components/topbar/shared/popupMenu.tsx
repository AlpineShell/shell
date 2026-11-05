import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTopbarBg } from "../../themeContext";
import { useSurfaceSuperseded } from "../../../hooks/useSurfaceSuperseded";
import { RADIUS, chromeSurfaceBounds, chromeContentBounds, type ChromeAnchor } from "../chrome/chromeShape";
import { setChromeSurface, clearChromeSurface, nextSurfaceId } from "../chrome/chromeStore";
import { placePopup } from "./popupPlacement";

const BAR_BOTTOM = 24;
const CLOSE_MS = 300;
const REGION_SHRINK_DELAY_MS = 260;

type Shape = { centerX: number; bodyWidth: number; bodyHeight: number; left: number; anchor: ChromeAnchor };

let activeMenu: { close: () => void } | null = null;

interface PopupMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    onOpen?: () => void;
    triggerBackground?: boolean;
}

export default function PopupMenu({ trigger, children, onOpen, triggerBackground = true }: PopupMenuProps) {
    const BG = useTopbarBg();

    const wrapperRef = useRef<HTMLDivElement>(null);
    const clipRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const [open, setOpen] = useState(false);
    const [shape, setShape] = useState<Shape | null>(null);

    const idRef = useRef(0);
    if (!idRef.current) idRef.current = nextSurfaceId();
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const suppressReset = useRef(false);
    const regionBottomRef = useRef(0);
    const shrinkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pendingClose = useRef(false);

    const superseded = useSurfaceSuperseded(idRef.current);

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    const selfRef = useRef<{ close: () => void } | null>(null);
    if (!selfRef.current) {
        selfRef.current = {
            close: () => {
                clearTimeout(closeTimer.current);
                clearTimeout(shrinkTimer.current);
                regionBottomRef.current = 0;
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
        const placement = placePopup(triggerRect.left + triggerRect.width / 2, bodyWidth, window.innerWidth);
        return { ...placement, bodyWidth, bodyHeight };
    }

    useLayoutEffect(() => {
        if (!open || shape) return;
        const next = measureShape();
        if (next) setShape(next);
    }, [open, shape]);

    useLayoutEffect(() => {
        if (!open || !shape || pendingClose.current) return;
        if (clipRef.current) {
            clipRef.current.style.height = `${shape.bodyHeight}px`;
            clipRef.current.style.clipPath = `inset(0 0 ${shape.bodyHeight}px 0 round 0 0 ${RADIUS}px ${RADIUS}px)`;
        }
        setChromeSurface({
            id: idRef.current,
            centerX: shape.centerX,
            bodyWidth: shape.bodyWidth,
            fullHeight: shape.bodyHeight,
            anchor: shape.anchor,
            contentEl: clipRef.current,
        });
        const geometry = {
            centerX: shape.centerX,
            bodyWidth: shape.bodyWidth,
            height: shape.bodyHeight,
            barBottom: BAR_BOTTOM,
            anchor: shape.anchor,
        };
        const settled = { ...chromeSurfaceBounds(geometry), contentBounds: chromeContentBounds(geometry) };
        const heldBottom = Math.max(settled.bottom, regionBottomRef.current);
        clearTimeout(shrinkTimer.current);
        regionBottomRef.current = heldBottom;
        window.topbar.setActiveRegion({ ...settled, bottom: heldBottom });
        if (settled.bottom < heldBottom) {
            shrinkTimer.current = setTimeout(() => {
                regionBottomRef.current = settled.bottom;
                window.topbar.setActiveRegion(settled);
            }, REGION_SHRINK_DELAY_MS);
        }
    }, [open, shape]);

    useEffect(() => {
        if (!open || !shape) return;
        const body = bodyRef.current;
        if (!body) return;
        let prevH = body.offsetHeight;
        const observer = new ResizeObserver(() => {
            if (pendingClose.current) return;
            const next = measureShape();
            if (!next) return;
            if (Math.abs(next.bodyHeight - prevH) < 1 && Math.abs(next.bodyWidth - shape.bodyWidth) < 1) return;
            prevH = next.bodyHeight;
            setShape(next);
        });
        observer.observe(body);
        return () => observer.disconnect();
    }, [open, shape]);

    function triggerClose() {
        pendingClose.current = true;
        if (activeMenu === selfRef.current) activeMenu = null;
        clearChromeSurface(idRef.current);
        clearTimeout(shrinkTimer.current);
        regionBottomRef.current = 0;
        window.topbar.setActiveRegion(null);
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => {
            setOpen(false);
            setShape(null);
        }, CLOSE_MS);
    }

    useEffect(() => {
        if (!open) return;
        const remove = window.topbar.onCloseMenus(() => triggerClose());
        return () => remove();
    }, [open]);

    useEffect(() => () => {
        clearTimeout(closeTimer.current);
        clearTimeout(shrinkTimer.current);
        clearChromeSurface(idRef.current);
        if (activeMenu === selfRef.current) {
            activeMenu = null;
            window.topbar.setActiveRegion(null);
        }
    }, []);

    function handleEnter() {
        clearTimeout(closeTimer.current);
        const other = activeMenu && activeMenu !== selfRef.current ? activeMenu : null;
        if (other) other.close();
        activeMenu = selfRef.current;
        if (open) {
            if (pendingClose.current) {
                pendingClose.current = false;
                setShape(null);
            }
            return;
        }
        pendingClose.current = false;
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

    return (
        <div
            ref={wrapperRef}
            className="relative flex items-center self-stretch"
            style={{ backgroundColor: open && triggerBackground ? BG : "transparent", transition: "background-color 120ms ease" }}
            onMouseEnter={handleEnter}
        >
            <div className="cursor-pointer">{trigger}</div>
            {open && createPortal(
                <div
                    ref={clipRef}
                    onMouseEnter={handleEnter}
                    style={{
                        position: "fixed",
                        left: shape ? shape.left : -9999,
                        top: BAR_BOTTOM,
                        width: shape ? shape.bodyWidth : undefined,
                        zIndex: 5,
                        pointerEvents: superseded ? "none" : (shape ? "auto" : "none"),
                        visibility: superseded ? "hidden" : undefined,
                        willChange: "clip-path",
                    }}
                >
                    <div ref={bodyRef}>{children}</div>
                </div>,
                document.body
            )}
        </div>
    );
}
