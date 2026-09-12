import { useDarkText } from "../themeContext";
import { useClockPrefs } from "../../hooks/useClockPrefs";
import { useCalendar } from "../../hooks/useCalendar";
import { useMinuteTick } from "../../hooks/useMinuteTick";
import PopupMenu from "./shared/popupMenu";
import CalendarFlyout from "./calendar/calendarFlyout";
import ClockFace from "./faces/clockFace";
import { resolveTimeFormat, formatClock, formatClockDate } from "./calendar/calendarLayout";

export default function Clock() {
    const darkText = useDarkText();
    const { prefs } = useClockPrefs();
    const { state } = useCalendar();
    const now = useMinuteTick();

    const label = <ClockFace time={formatClock(now, resolveTimeFormat(prefs))} date={formatClockDate(now)} darkText={darkText} />;

    if (!state.connected) return label;

    return <PopupMenu trigger={label}><CalendarFlyout /></PopupMenu>;
}
