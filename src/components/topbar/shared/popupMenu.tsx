import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";

const BG = "rgb(31,32,32)";
const CORNER = 12;

let forceCloseActive: (() => void) | null = null;

interface PopupMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: "left" | "right";
    onOpen?: () => void;
}

export default function PopupMenu({ trigger, children, align = "left", onOpen }: PopupMenuProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
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

    function handleEnter() {
        clearTimeout(closeTimer.current);
        clearTimeout(closeAnimTimer.current);
        setClosing(false);
        if (!open) {
            if (forceCloseActive) forceCloseActive();
            if (wrapperRef.current) {
                const rect = wrapperRef.current.getBoundingClientRect();
                const style: React.CSSProperties = { position: "fixed", top: rect.bottom };
                if (align === "right") style.right = window.innerWidth - rect.right;
                else style.left = rect.left;
                setPopupStyle(style);
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
                    className={`z-[5] mt-[2px] ${closing ? "menu-exit" : "menu-enter"}`}
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
