import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTopbarBg } from "../../themeContext";

const CORNER = 12;

let forceCloseActive: (() => void) | null = null;

const SCREEN_PAD = 16;

interface PopupMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    onOpen?: () => void;
}

export default function PopupMenu({ trigger, children, onOpen }: PopupMenuProps) {
    const BG = useTopbarBg();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
    const closeTimer = useRef<ReturnType<typeof setTimeout>>();
    const closeAnimTimer = useRef<ReturnType<typeof setTimeout>>();
    const suppressHeight = useRef(false);

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    useEffect(() => {
        if (open) {
            onOpenRef.current?.();
        } else {
            if (!suppressHeight.current) window.topbar.setHeight(24);
            suppressHeight.current = false;
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        repositionPopup();
        const popup = popupRef.current;
        if (!popup) return;
        const observer = new ResizeObserver(() => repositionPopup());
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
        const left = Math.max(SCREEN_PAD, Math.min(centerX - popupWidth / 2, window.innerWidth - popupWidth - SCREEN_PAD));
        setPopupStyle({ position: "fixed", top: rect.bottom, left });
    }

    function handleEnter() {
        clearTimeout(closeTimer.current);
        clearTimeout(closeAnimTimer.current);
        setClosing(false);
        if (!open) {
            if (forceCloseActive) forceCloseActive();
            if (wrapperRef.current) {
                const rect = wrapperRef.current.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                setPopupStyle({ position: "fixed", top: rect.bottom, left: centerX });
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
                    className={`z-[5] mt-0.5 ${closing ? "menu-exit" : "menu-enter"}`}
                    style={popupStyle}
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
                >
                    <div
                        className="absolute top-0 right-full"
                        style={{ width: CORNER, height: CORNER, background: `radial-gradient(circle at 0% 100%, transparent ${CORNER}px, ${BG} ${CORNER}px)` }}
                    />
                    <div
                        className="absolute top-0 left-full"
                        style={{ width: CORNER, height: CORNER, background: `radial-gradient(circle at 100% 100%, transparent ${CORNER}px, ${BG} ${CORNER}px)` }}
                    />
                    <div className="overflow-hidden rounded-b-xl shadow-xl" style={{ backgroundColor: BG }}>
                        {children}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
