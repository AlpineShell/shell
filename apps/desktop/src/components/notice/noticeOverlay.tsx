import { useEffect, useRef, useState } from "react";

const TONE_ACCENT: Record<ShellNoticeTone, string> = {
    info: "bg-white/45",
    success: "bg-emerald-400/80",
    error: "bg-rose-400/80",
};

function Spinner() {
    return (
        <span className="block size-3 rounded-full border-[1.5px] border-white/25 border-t-white/80 animate-spin" />
    );
}

export default function NoticeOverlay() {
    const [notice, setNotice] = useState<ShellNotice | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        window.notice.current().then((initial) => {
            if (initial) setNotice(initial);
        });
        const stopShow = window.notice.onShow((next) => setNotice(next));
        const stopHide = window.notice.onHide(() => setNotice(null));
        return () => {
            stopShow();
            stopHide();
        };
    }, []);

    useEffect(() => {
        const card = cardRef.current;
        if (!card) return;
        const report = () => window.notice.reportSize(Math.ceil(card.getBoundingClientRect().height) + 16);
        report();
        const observer = new ResizeObserver(report);
        observer.observe(card);
        return () => observer.disconnect();
    }, [notice]);

    if (!notice) return null;

    return (
        <div className="w-screen h-screen p-2 select-none">
            <div
                ref={cardRef}
                className="flex items-start gap-3 rounded-xl bg-[#1f2020]/95 px-3.5 py-3 text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur"
            >
                <span className={`mt-1.5 block size-2 shrink-0 rounded-full ${TONE_ACCENT[notice.tone]}`} />
                <div className="min-w-0 flex-1">
                    {notice.title && <div className="text-[12px] font-medium leading-4 text-white/95">{notice.title}</div>}
                    <div className="text-[12px] leading-4 text-white/70">{notice.message}</div>
                    {notice.action && (
                        <button
                            type="button"
                            className="mt-2 rounded-md bg-white/10 px-2 py-1 text-[11px] leading-4 text-white/90 hover:bg-white/20"
                            onClick={() => window.notice.runAction()}
                        >
                            {notice.action.label}
                        </button>
                    )}
                </div>
                {notice.busy ? (
                    <Spinner />
                ) : (
                    <button
                        type="button"
                        aria-label="Dismiss"
                        className="-mr-1 -mt-1 rounded-md px-1.5 py-0.5 text-[13px] leading-4 text-white/40 hover:bg-white/10 hover:text-white/80"
                        onClick={() => window.notice.dismiss()}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}
