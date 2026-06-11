import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTopbarBg, useDarkText, useFullscreenWindow, useMenuOpenChange } from "../../themeContext";
import { useFlyUnderBar } from "../../../hooks/useFlyUnderBar";

const CORNER = 16;
const SCREEN_PAD = 0;
const SLIDE_MS = 320;

type MenuGeometry = { center: number; width: number; height: number };

let activeMenu: { close: () => void; measure: () => MenuGeometry | null } | null = null;

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
    const popupRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const cornerLeftRef = useRef<SVGSVGElement>(null);
    const cornerRightRef = useRef<SVGSVGElement>(null);
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const closeAnimTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const suppressReset = useRef(false);
    const morphFromRef = useRef<MenuGeometry | null>(null);
    const morphingRef = useRef(false);

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    const selfRef = useRef<{ close: () => void; measure: () => MenuGeometry | null } | null>(null);
    if (!selfRef.current) {
        selfRef.current = {
            measure: () => {
                const box = boxRef.current;
                if (!box) return null;
                const rect = box.getBoundingClientRect();
                if (rect.width <= 0) return null;
                return { center: rect.left + rect.width / 2, width: rect.width, height: rect.height };
            },
            close: () => {
                clearTimeout(closeTimer.current);
                clearTimeout(closeAnimTimer.current);
                suppressReset.current = true;
                setOpen(false);
                setClosing(false);
            },
        };
    }

    useFlyUnderBar(bodyRef, [cornerLeftRef, cornerRightRef], CORNER, open, closing, morphFromRef.current !== null);

    useEffect(() => {
        if (open) {
            onOpenRef.current?.();
        } else {
            if (!suppressReset.current) {
                onMenuOpenChange(false);
                window.topbar.setHeight(24);
            }
            suppressReset.current = false;
        }
    }, [open]);

    function reportBounds(center: number, width: number) {
        onMenuOpenChange(true, { left: center - width / 2 - CORNER, right: center + width / 2 + CORNER });
    }

    useLayoutEffect(() => {
        if (!open) return;
        repositionPopup();
    }, [open]);

    useLayoutEffect(() => {
        if (!open) return;
        const popup = popupRef.current;
        const box = boxRef.current;
        const wrapper = wrapperRef.current;
        if (!popup || !box || !wrapper) return;

        box.style.width = "";
        box.style.height = "";
        const boxRect = box.getBoundingClientRect();
        const width = boxRect.width;
        const height = boxRect.height;
        const triggerRect = wrapper.getBoundingClientRect();
        const triggerCenter = triggerRect.left + triggerRect.width / 2;
        const left = Math.max(SCREEN_PAD, Math.min(triggerCenter - width / 2, window.innerWidth - width - SCREEN_PAD));
        const center = left + width / 2;
        reportBounds(center, width);

        const from = morphFromRef.current;
        morphFromRef.current = null;
        if (!from || from.width <= 0) return;

        morphingRef.current = true;
        let raf = 0;
        let startTime = 0;
        const step = (now: number) => {
            if (!startTime) startTime = now;
            const progress = Math.min(1, (now - startTime) / SLIDE_MS);
            const eased = 1 - Math.pow(1 - progress, 3);
            const c = from.center + (center - from.center) * eased;
            const w = from.width + (width - from.width) * eased;
            const h = from.height + (height - from.height) * eased;
            popup.style.transform = `translateX(${(c - center) - (w - width) / 2}px)`;
            box.style.width = `${w}px`;
            box.style.height = `${h}px`;
            if (progress < 1) {
                raf = requestAnimationFrame(step);
            } else {
                box.style.width = "";
                box.style.height = "";
                popup.style.transform = "";
                morphingRef.current = false;
            }
        };
        raf = requestAnimationFrame(step);
        return () => {
            cancelAnimationFrame(raf);
            morphingRef.current = false;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const popup = popupRef.current;
        if (!popup) return;
        let prevWidth = popup.offsetWidth;
        const observer = new ResizeObserver((entries) => {
            if (morphingRef.current) return;
            const width = entries[0]?.contentRect.width ?? popup.offsetWidth;
            if (width === prevWidth) return;
            prevWidth = width;
            repositionPopup();
            const geometry = selfRef.current?.measure();
            if (geometry) reportBounds(geometry.center, geometry.width);
        });
        observer.observe(popup);
        return () => observer.disconnect();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const remove = window.topbar.onCloseMenus(() => triggerClose());
        return () => remove();
    }, [open]);

    useEffect(() => () => {
        clearTimeout(closeTimer.current);
        clearTimeout(closeAnimTimer.current);
        if (activeMenu === selfRef.current) activeMenu = null;
    }, []);

    function triggerClose() {
        if (activeMenu === selfRef.current) activeMenu = null;
        setClosing(true);
        closeAnimTimer.current = setTimeout(() => {
            setOpen(false);
            setClosing(false);
        }, 300);
    }

    function repositionPopup() {
        const wrapper = wrapperRef.current;
        const popup = popupRef.current;
        if (!wrapper || !popup) return;
        const rect = wrapper.getBoundingClientRect();
        const popupWidth = popup.offsetWidth;
        const centerX = rect.left + rect.width / 2;
        const left = Math.round(Math.max(SCREEN_PAD, Math.min(centerX - popupWidth / 2, window.innerWidth - popupWidth - SCREEN_PAD)));
        setPopupStyle({ position: "fixed", top: Math.round(rect.bottom), left });
    }

    function handleEnter() {
        clearTimeout(closeTimer.current);
        clearTimeout(closeAnimTimer.current);
        setClosing(false);
        const other = activeMenu && activeMenu !== selfRef.current ? activeMenu : null;
        if (other) {
            morphFromRef.current = other.measure();
            other.close();
        } else if (!open) {
            morphFromRef.current = null;
        }
        activeMenu = selfRef.current;
        if (open) return;
        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            setPopupStyle({ position: "fixed", top: Math.round(rect.bottom), left: -9999 });
        }
        window.topbar.setHeight(500);
        requestAnimationFrame(() => setOpen(true));
    }

    function handleLeave() {
        closeTimer.current = setTimeout(() => triggerClose(), 80);
    }

    return (
        <div
            ref={wrapperRef}
            className="relative flex items-center self-stretch"
            style={{ backgroundColor: open ? BG : "transparent", transition: "background-color 120ms ease" }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
        >
            <div className="cursor-pointer">
                {trigger}
            </div>
            {open && createPortal(
                <div
                    ref={popupRef}
                    className="z-5"
                    style={popupStyle}
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
                >
                    <svg
                        ref={cornerLeftRef}
                        className="absolute right-full"
                        width={CORNER}
                        height={CORNER}
                        viewBox={`0 0 ${CORNER} ${CORNER}`}
                        style={{ top: -0.5, overflow: "visible", display: "block" }}
                    >
                        <path d={`M0 0 H${CORNER} V${CORNER} A${CORNER} ${CORNER} 0 0 0 0 0 Z`} fill={BG} />
                        {borderColor && <path d={`M0 0 A${CORNER} ${CORNER} 0 0 1 ${CORNER} ${CORNER}`} fill="none" stroke={borderColor} strokeWidth={1} />}
                    </svg>
                    <svg
                        ref={cornerRightRef}
                        className="absolute left-full"
                        width={CORNER}
                        height={CORNER}
                        viewBox={`0 0 ${CORNER} ${CORNER}`}
                        style={{ top: -0.5, overflow: "visible", display: "block" }}
                    >
                        <path d={`M${CORNER} 0 H0 V${CORNER} A${CORNER} ${CORNER} 0 0 1 ${CORNER} 0 Z`} fill={BG} />
                        {borderColor && <path d={`M${CORNER} 0 A${CORNER} ${CORNER} 0 0 0 0 ${CORNER}`} fill="none" stroke={borderColor} strokeWidth={1} />}
                    </svg>
                    <div ref={bodyRef}>
                        <div style={{ position: "relative" }}>
                            <div
                                ref={boxRef}
                                className="overflow-hidden rounded-b-2xl shadow-xl"
                                style={{ backgroundColor: BG }}
                            >
                                {children}
                            </div>
                            {borderColor && (
                                <div style={{
                                    position: "absolute",
                                    top: CORNER - 0.5,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    borderLeft: `1px solid ${borderColor}`,
                                    borderRight: `1px solid ${borderColor}`,
                                    borderBottom: `1px solid ${borderColor}`,
                                    borderRadius: "0 0 16px 16px",
                                    pointerEvents: "none",
                                }} />
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
