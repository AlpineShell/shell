import { useEffect, useRef, useState, type ReactNode } from "react";

const BG = "rgb(31,32,32)";
const CORNER = 12;
const GAP = 2;

let forceCloseActive: (() => void) | null = null;

interface PopupMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: "left" | "right";
    onOpen?: () => void;
}

export default function PopupMenu({ trigger, children, align = "left", onOpen }: PopupMenuProps) {
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
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
            className="relative flex items-center self-stretch"
            style={{ backgroundColor: open ? BG : 'transparent', transition: 'background-color 120ms ease' }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
        >
            <div className="cursor-pointer">
                {trigger}
            </div>
            {open && (
                <div
                    className={`absolute z-50 ${align === "right" ? "right-0" : "left-0"} ${closing ? "menu-exit" : "menu-enter"}`}
                    style={{ top: `calc(100% + ${GAP}px)` }}
                >
                    <div
                        className="absolute right-full"
                        style={{ top: -GAP, width: CORNER, height: CORNER + GAP, background: `radial-gradient(circle at 0% 100%, transparent ${CORNER}px, ${BG} ${CORNER}px)` }}
                    />
                    <div
                        className="absolute left-full"
                        style={{ top: -GAP, width: CORNER, height: CORNER + GAP, background: `radial-gradient(circle at 100% 100%, transparent ${CORNER}px, ${BG} ${CORNER}px)` }}
                    />
                    <div className="overflow-hidden rounded-b-xl shadow-xl" style={{ backgroundColor: BG }}>
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
}
