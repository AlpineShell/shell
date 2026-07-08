import { useState, useEffect } from "react";
import { useDarkText } from "../themeContext";
import { useClockPrefs } from "../../hooks/useClockPrefs";
import { useCalendar } from "../../hooks/useCalendar";
import PopupMenu from "./shared/popupMenu";
import CalendarFlyout from "./calendar/calendarFlyout";
import { resolveTimeFormat, formatClock } from "./calendar/calendarLayout";

export default function Clock() {
    const darkText = useDarkText();
    const { prefs } = useClockPrefs();
    const { state } = useCalendar();
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const time = formatClock(now, resolveTimeFormat(prefs));
    const date = `${months[now.getMonth()]} ${now.getDate()}`;

    const label = (
        <div className={`${darkText ? "text-black" : "text-white"} text-[12px] flex hover:cursor-pointer rounded-full px-2 ${darkText ? "hover:bg-black/10" : "hover:bg-white/10"} h-4.5 items-center transition-colors duration-300`}>
            {time} {date}
        </div>
    );

    if (!state.connected) return label;

    return <PopupMenu trigger={label}><CalendarFlyout /></PopupMenu>;
}
