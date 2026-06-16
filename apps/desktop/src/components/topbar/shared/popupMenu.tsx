import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTopbarBg, useDarkText, useFullscreenWindow, useMenuOpenChange } from "../../themeContext";

const SHOULDER = 14;
const RADIUS = 14;
const SCREEN_PAD = 6;

const ENTER_MS = 320;
const EXIT_MS = 240;
const SWITCH_MS = 150;
const ENTER_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const EXIT_EASE = "cubic-bezier(0.4, 0, 0.7, 0.2)";

type Shape = { width: number; height: number; left: number; top: number };

let activeMenu: { close: () => void } | null = null;

function sidesSequence(width: number, height: number) {
    const c = SHOULDER;
    const r = RADIUS;
    return `A${c} ${c} 0 0 0 ${width - c} ${c} L${width - c} ${height - r} A${r} ${r} 0 0 1 ${width - c - r} ${height} L${c + r} ${height} A${r} ${r} 0 0 1 ${c} ${height - r} L${c} ${c} A${c} ${c} 0 0 0 0 0`;
}

function fillPath(width: number, height: number) {
    return `M0 0 L${width} 0 ${sidesSequence(width, height)} Z`;
}

function borderPath(width: number, height: number) {
    return `M${width} 0 ${sidesSequence(width, height)}`;
}

interface PopupMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    onOpen?: () => void;
}

export default function PopupMenu({ trigger, children, onOpen }: PopupMenuProps) {
    const BG = useTopbarBg();
    const darkText = useDarkText();
    const fullscreenWindow = useFullscreenWindow();
    const borderColor = fullscreenWindow ? (darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)") : null;
    const onMenuOpenChange = useMenuOpenChange();

    const wrapperRef = useRef<HTMLDivElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [open, setOpen] = useState(false);
    const [shape, setShape] = useState<Shape | null>(null);

    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const switching = useRef(false);
    const suppressReset = useRef(false);
    const entered = useRef(false);

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    const selfRef = useRef<{ close: () => void } | null>(null);
    if (!selfRef.current) {
        selfRef.current = {
            close: () => {
                clearTimeout(closeTimer.current);
                clearTimeout(leaveTimer.current);
                suppressReset.current = true;
                entered.current = false;
                setOpen(false);
                setShape(null);
            },
        };
    }

    useEffect(() => {
        if (open) {
            onOpenRef.current?.();
            return;
        }
        if (suppressReset.current) {
            suppressReset.current = false;
            return;
        }
        onMenuOpenChange(false);
        window.topbar.setActiveRegion(null);
    }, [open]);

    function reportBounds(svgLeft: number, width: number) {
        onMenuOpenChange(true, { left: svgLeft, right: svgLeft + width });
    }

    function measureShape(): Shape | null {
        const wrapper = wrapperRef.current;
        const content = contentRef.current;
        if (!wrapper || !content) return null;
        content.style.width = "max-content";
        const contentRect = content.getBoundingClientRect();
        const bodyWidth = Math.round(contentRect.width);
        const bodyHeight = Math.round(contentRect.height);
        content.style.width = `${bodyWidth}px`;
        const width = bodyWidth + SHOULDER * 2;
        const triggerRect = wrapper.getBoundingClientRect();
        const center = triggerRect.left + triggerRect.width / 2;
        const maxLeft = window.innerWidth - width - SCREEN_PAD;
        const left = Math.round(Math.max(SCREEN_PAD, Math.min(center - width / 2, maxLeft)));
        const top = Math.round(triggerRect.bottom);
        return { width, height: bodyHeight, left, top };
    }

    useLayoutEffect(() => {
        if (!open || shape) return;
        const next = measureShape();
        if (!next) return;
        setShape(next);
    }, [open, shape]);

    useLayoutEffect(() => {
        if (!open || !shape) return;
        reportBounds(shape.left, shape.width);
        window.topbar.setActiveRegion({
            top: shape.top,
            bottom: shape.top + shape.height,
            left: shape.left,
            right: shape.left + shape.width,
        });
        const el = portalRef.current;
        if (!el) return;

        if (entered.current) return;
        entered.current = true;

        const isSwitch = switching.current;
        switching.current = false;
        el.style.transformOrigin = "top left";

        if (isSwitch) {
            el.style.transition = "none";
            el.style.transform = "translateY(0px)";
            el.style.opacity = "0";
            void el.offsetWidth;
            el.style.transition = `opacity ${SWITCH_MS}ms ease`;
            el.style.opacity = "1";
            return;
        }

        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.transform = `translateY(${-shape.height}px)`;
        void el.offsetWidth;
        el.style.transition = `transform ${ENTER_MS}ms ${ENTER_EASE}, opacity 180ms ease`;
        el.style.opacity = "1";
        el.style.transform = "translateY(0px)";
    }, [open, shape]);

    useEffect(() => {
        if (!open || !shape) return;
        const content = contentRef.current;
        if (!content) return;
        let prev = content.offsetHeight;
        const observer = new ResizeObserver(() => {
            if (!entered.current) return;
            const next = measureShape();
            if (!next) return;
            if (Math.abs(next.height - prev) < 1 && Math.abs(next.width - shape.width) < 1) return;
            prev = next.height;
            setShape(next);
        });
        observer.observe(content);
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
    }, []);

    function triggerClose() {
        if (activeMenu === selfRef.current) activeMenu = null;
        const el = portalRef.current;
        if (!el || !shape) {
            setOpen(false);
            setShape(null);
            entered.current = false;
            return;
        }
        el.style.transition = `transform ${EXIT_MS}ms ${EXIT_EASE}, opacity ${EXIT_MS}ms ease`;
        el.style.opacity = "0";
        el.style.transform = `translateY(${-shape.height}px)`;
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => {
            entered.current = false;
            setOpen(false);
            setShape(null);
        }, EXIT_MS);
    }

    function handleEnter() {
        clearTimeout(closeTimer.current);
        clearTimeout(leaveTimer.current);
        const other = activeMenu && activeMenu !== selfRef.current ? activeMenu : null;
        if (other) {
            switching.current = true;
            other.close();
        } else if (!open) {
            switching.current = false;
        }
        activeMenu = selfRef.current;
        if (open) return;
        entered.current = false;
        const triggerRect = wrapperRef.current?.getBoundingClientRect();
        window.topbar.setActiveRegion({
            top: triggerRect ? triggerRect.bottom : 24,
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
                    ref={portalRef}
                    style={{
                        position: "fixed",
                        left: shape ? shape.left : -9999,
                        top: shape ? shape.top : -9999,
                        width: shape ? shape.width : undefined,
                        height: shape ? shape.height : undefined,
                        zIndex: 5,
                        pointerEvents: shape ? "auto" : "none",
                        filter: "drop-shadow(0 12px 26px rgba(0,0,0,0.30))",
                        willChange: "transform, opacity",
                    }}
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
                >
                    {shape && (
                        <svg
                            width={shape.width}
                            height={shape.height}
                            viewBox={`0 0 ${shape.width} ${shape.height}`}
                            style={{ display: "block", overflow: "visible", position: "absolute", top: 0, left: 0 }}
                        >
                            <path d={fillPath(shape.width, shape.height)} fill={BG} />
                            {borderColor && (
                                <path
                                    d={borderPath(shape.width, shape.height)}
                                    fill="none"
                                    stroke={borderColor}
                                    strokeWidth={1}
                                    vectorEffect="non-scaling-stroke"
                                />
                            )}
                        </svg>
                    )}
                    <div
                        ref={contentRef}
                        style={{
                            position: "relative",
                            marginLeft: SHOULDER,
                            width: shape ? shape.width - SHOULDER * 2 : undefined,
                            overflow: "hidden",
                            borderRadius: `0 0 ${RADIUS}px ${RADIUS}px`,
                        }}
                    >
                        {children}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
