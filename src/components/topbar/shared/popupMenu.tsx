import { useEffect, useRef, useState, type ReactNode } from "react";

const BG = "rgb(31,32,32)";
const CORNER = 10;

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

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    useEffect(() => {
        if (open) {
            window.topbar.setHeight(500);
            onOpenRef.current?.();
        } else {
            window.topbar.setHeight(24);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const removeCloseListener = window.topbar.onCloseMenus(() => triggerClose());
        return () => removeCloseListener();
    }, [open]);

    function triggerClose() {
        setClosing(true);
        closeAnimTimer.current = setTimeout(() => {
            setOpen(false);
            setClosing(false);
        }, 100);
    }

    function handleEnter() {
        clearTimeout(closeTimer.current);
        clearTimeout(closeAnimTimer.current);
        setClosing(false);
        if (!open) setOpen(true);
    }

    function handleLeave() {
        closeTimer.current = setTimeout(() => triggerClose(), 80);
    }

    return (
        <div
            className="relative flex items-center self-stretch"
            style={open ? { backgroundColor: BG } : {}}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
        >
            <div className="cursor-pointer">
                {trigger}
            </div>
            {open && (
                <div
                    className={`absolute top-full z-50 ${align === "right" ? "right-0" : "left-0"} ${closing ? "menu-exit" : "menu-enter"}`}
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
                </div>
            )}
        </div>
    );
}
