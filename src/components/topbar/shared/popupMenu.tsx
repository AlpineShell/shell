import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTopbarBg, useDarkText, useFullscreenWindow, useMenuOpenChange } from "../../themeContext";

const CORNER = 16;

let forceCloseActive: (() => void) | null = null;

const SCREEN_PAD = 0;

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
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const closeAnimTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const suppressHeight = useRef(false);

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    useEffect(() => {
        if (open) {
            onOpenRef.current?.();
        } else {
            onMenuOpenChange(false);
            if (!suppressHeight.current) window.topbar.setHeight(24);
            suppressHeight.current = false;
        }
    }, [open]);

    function reportMenuBounds() {
        requestAnimationFrame(() => {
            if (popupRef.current) {
                const rect = popupRef.current.getBoundingClientRect();
                onMenuOpenChange(true, { left: rect.left - CORNER, right: rect.right + CORNER });
            }
        });
    }

    useLayoutEffect(() => {
        if (!open) return;
        repositionPopup();
        reportMenuBounds();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const popup = popupRef.current;
        if (!popup) return;
        let prevWidth = popup.offsetWidth;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? popup.offsetWidth;
            if (width === prevWidth) return;
            prevWidth = width;
            repositionPopup();
            reportMenuBounds();
        });
        observer.observe(popup);
        return () => observer.disconnect();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const remove = window.topbar.onCloseMenus(() => triggerClose());
        return () => remove();
    }, [open]);

    function triggerClose() {
        setClosing(true);
        forceCloseActive = null;
        closeAnimTimer.current = setTimeout(() => {
            setOpen(false);
            setClosing(false);
        }, 100);
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
        if (!open) {
            if (forceCloseActive) forceCloseActive();
            if (wrapperRef.current) {
                const rect = wrapperRef.current.getBoundingClientRect();
                setPopupStyle({ position: "fixed", top: Math.round(rect.bottom), left: -9999 });
            }
            window.topbar.setHeight(500);
            requestAnimationFrame(() => setOpen(true));
        }
        forceCloseActive = () => {
            clearTimeout(closeTimer.current);
            clearTimeout(closeAnimTimer.current);
            suppressHeight.current = true;
            setOpen(false);
            setClosing(false);
        };
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
                    className={`z-5 ${closing ? "menu-exit" : "menu-enter"}`}
                    style={popupStyle}
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
                >
                    <svg
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
                        className="absolute left-full"
                        width={CORNER}
                        height={CORNER}
                        viewBox={`0 0 ${CORNER} ${CORNER}`}
                        style={{ top: -0.5, overflow: "visible", display: "block" }}
                    >
                        <path d={`M${CORNER} 0 H0 V${CORNER} A${CORNER} ${CORNER} 0 0 1 ${CORNER} 0 Z`} fill={BG} />
                        {borderColor && <path d={`M${CORNER} 0 A${CORNER} ${CORNER} 0 0 0 0 ${CORNER}`} fill="none" stroke={borderColor} strokeWidth={1} />}
                    </svg>
                    <div style={{ position: "relative" }}>
                        <div
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
                </div>,
                document.body
            )}
        </div>
    );
}
