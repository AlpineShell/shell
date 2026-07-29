import { useEffect, useLayoutEffect, useRef, useState } from "react";

const BAR_BOTTOM = 24;
const MY_DISPLAY_ID = Number(new URLSearchParams(window.location.search).get("displayId"));

const TONE_ACCENT: Record<ShellNoticeTone, string> = {
    info: "bg-white/45",
    success: "bg-emerald-400/80",
    error: "bg-rose-400/80",
};

function Spinner() {
    return (
        <span className="block size-3 shrink-0 rounded-full border-[1.5px] border-white/25 border-t-white/80 animate-spin" />
    );
}

function isForThisDisplay(notice: ShellNotice) {
    return notice.displayId == null || notice.displayId === MY_DISPLAY_ID;
}

export default function NoticeStrip() {
    const [notice, setNotice] = useState<ShellNotice | null>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const claimedRef = useRef(false);

    useEffect(() => {
        window.notice.current().then((initial) => {
            if (initial && isForThisDisplay(initial)) setNotice(initial);
        });
        const stopShow = window.notice.onShow((next) => setNotice(isForThisDisplay(next) ? next : null));
        const stopHide = window.notice.onHide(() => setNotice(null));
        return () => {
            stopShow();
            stopHide();
        };
    }, []);

    const interactive = Boolean(notice && !notice.pill);

    useLayoutEffect(() => {
        const card = cardRef.current;
        if (!interactive || !card) {
            if (claimedRef.current) {
                window.topbar.setActiveRegion(null);
                claimedRef.current = false;
            }
            return;
        }
        const claim = () => {
            const box = card.getBoundingClientRect();
            claimedRef.current = true;
            window.topbar.setActiveRegion({
                top: BAR_BOTTOM,
                bottom: Math.ceil(box.bottom),
                left: Math.floor(box.left),
                right: Math.ceil(box.right),
            });
        };
        claim();
        const observer = new ResizeObserver(claim);
        observer.observe(card);
        return () => observer.disconnect();
    }, [interactive, notice]);

    useEffect(
        () => () => {
            if (claimedRef.current) window.topbar.setActiveRegion(null);
        },
        [],
    );

    if (!notice) return null;

    return (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-2 pt-1.5">
            <div
                ref={cardRef}
                className={`flex items-start gap-2.5 rounded-b-xl rounded-t-md bg-[#1f2020]/95 text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur ${
                    notice.pill ? "max-w-[420px] px-3 py-1.5" : "pointer-events-auto w-[380px] px-3.5 py-3"
                }`}
            >
                {notice.busy ? (
                    <span className="mt-0.5">
                        <Spinner />
                    </span>
                ) : (
                    <span className={`mt-1.5 block size-2 shrink-0 rounded-full ${TONE_ACCENT[notice.tone]}`} />
                )}
                <div className="min-w-0 flex-1">
                    {notice.title && (
                        <div className="truncate text-[12px] font-medium leading-4 text-white/95">{notice.title}</div>
                    )}
                    <div className={`text-[12px] leading-4 text-white/70 ${notice.pill ? "truncate" : ""}`}>
                        {notice.message}
                    </div>
                    {notice.confirm && (
                        <div className="mt-2.5 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-md px-2 py-1 text-[11px] leading-4 text-white/60 hover:bg-white/10 hover:text-white/90"
                                onClick={() => window.notice.dismiss()}
                            >
                                {notice.confirm.cancelLabel}
                            </button>
                            <button
                                type="button"
                                className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-medium leading-4 text-white hover:bg-white/25"
                                onClick={() => window.notice.confirm()}
                            >
                                {notice.confirm.label}
                            </button>
                        </div>
                    )}
                    {notice.action && !notice.confirm && !notice.pill && (
                        <button
                            type="button"
                            className="mt-2 rounded-md bg-white/10 px-2 py-1 text-[11px] leading-4 text-white/90 hover:bg-white/20"
                            onClick={() => window.notice.runAction()}
                        >
                            {notice.action.label}
                        </button>
                    )}
                </div>
                {!notice.busy && !notice.confirm && !notice.pill && (
                    <button
                        type="button"
                        aria-label="Dismiss"
                        className="-mr-1 -mt-0.5 rounded-md px-1.5 py-0.5 text-[13px] leading-4 text-white/40 hover:bg-white/10 hover:text-white/80"
                        onClick={() => window.notice.dismiss()}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}
