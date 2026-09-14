function noticeTooltip(notice: NoticeFaceProps["notice"]) {
    return notice.title ? `${notice.title} — ${notice.message}` : notice.message;
}

function noticeDotClass(tone: ShellNoticeTone, darkText: boolean) {
    if (tone === "error") return "bg-rose-500";
    if (tone === "success") return "bg-emerald-500";
    return darkText ? "bg-black/30" : "bg-white/45";
}

export default function NoticeFace({ notice, darkText }: NoticeFaceProps) {
    return (
        <div className="flex items-center gap-1.5 px-1.5 max-w-[280px]" title={noticeTooltip(notice)}>
            {notice.busy ? (
                <span
                    className={`block size-3 shrink-0 rounded-full border-[1.5px] animate-spin ${
                        darkText ? "border-black/15 border-t-black/60" : "border-white/25 border-t-white/80"
                    }`}
                />
            ) : (
                <span className={`block size-1.5 shrink-0 rounded-full ${noticeDotClass(notice.tone, darkText)}`} />
            )}
            <span className={`truncate text-[11px] leading-4 ${darkText ? "text-black/70" : "text-white/75"}`}>
                {notice.message}
            </span>
        </div>
    );
}
