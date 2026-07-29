import { useDarkText } from "../themeContext";
import { useShellNotice } from "../../hooks/useShellNotice";

export default function NoticeStatus() {
    const darkText = useDarkText();
    const notice = useShellNotice();

    if (!notice || !notice.pill) return null;

    const dotColor = notice.tone === "error" ? "bg-rose-500" : notice.tone === "success" ? "bg-emerald-500" : null;

    return (
        <div className="flex items-center gap-1.5 px-1.5 max-w-[280px]" title={notice.title ? `${notice.title} — ${notice.message}` : notice.message}>
            {notice.busy ? (
                <span
                    className={`block size-3 shrink-0 rounded-full border-[1.5px] animate-spin ${
                        darkText ? "border-black/15 border-t-black/60" : "border-white/25 border-t-white/80"
                    }`}
                />
            ) : (
                <span className={`block size-1.5 shrink-0 rounded-full ${dotColor ?? (darkText ? "bg-black/30" : "bg-white/45")}`} />
            )}
            <span className={`truncate text-[11px] leading-4 ${darkText ? "text-black/70" : "text-white/75"}`}>
                {notice.message}
            </span>
        </div>
    );
}
