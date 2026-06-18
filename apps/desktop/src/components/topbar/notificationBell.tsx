import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useDarkText } from "../themeContext";
import { useNotifications } from "../../hooks/useNotifications";

export default function NotificationBell() {
    const darkText = useDarkText();
    const { unreadCount } = useNotifications();
    const [open, setOpen] = useState(false);
    const color = darkText ? "black" : "white";

    useEffect(() => {
        const offShow = window.shell?.notifications?.onCenterShow?.(() => setOpen(true));
        const offHide = window.shell?.notifications?.onCenterHide?.(() => setOpen(false));
        return () => { offShow?.(); offHide?.(); };
    }, []);

    const toggle = () => {
        if (open) {
            window.shell?.notifications?.closeCenter?.();
        } else {
            window.shell?.notifications?.markAllRead?.();
            window.shell?.notifications?.openCenter?.();
        }
    };

    return (
        <button
            onClick={toggle}
            aria-label="Notifications"
            className={`relative flex items-center justify-center w-6 h-6 rounded-md cursor-pointer transition-colors ${open ? (darkText ? "bg-black/10" : "bg-white/15") : (darkText ? "hover:bg-black/10" : "hover:bg-white/10")}`}
        >
            <Bell color={color} size={14} />
            {unreadCount > 0 && (
                <span
                    className="absolute -top-0.5 -right-0.5 min-w-3 h-3 px-0.5 flex items-center justify-center rounded-full text-[8px] font-semibold leading-none"
                    style={{ backgroundColor: "#ef4444", color: "white" }}
                >
                    {unreadCount > 99 ? "99+" : unreadCount}
                </span>
            )}
        </button>
    );
}
