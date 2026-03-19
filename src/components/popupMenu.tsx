import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDarkText } from "./themeContext";

interface PopupMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: "left" | "right";
}

export default function PopupMenu({ trigger, children, align = "left" }: PopupMenuProps) {
    const darkText = useDarkText();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            window.topbar.setHeight(500);
        } else {
            window.topbar.setHeight(24);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        const removeCloseListener = window.topbar.onCloseMenus(() => setOpen(false));
        return () => {
            document.removeEventListener("mousedown", handleClick);
            removeCloseListener();
        };
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <div className="cursor-pointer" onClick={() => setOpen(!open)}>
                {trigger}
            </div>
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onMouseDown={() => setOpen(false)}
                    />
                    <div className={`ring-gray-500/50 ring-1 absolute ${darkText ? "bg-[#ffffff] border border-black/15" : "bg-[#2d2d2d]"} rounded-lg overflow-hidden top-full mt-1 z-50 ${align === "right" ? "right-0" : "left-0 ml-1"}`}>
                        {children}
                    </div>
                </>
            )}
        </div>
    );
}
