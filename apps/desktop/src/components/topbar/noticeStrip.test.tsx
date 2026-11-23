import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import NoticeStrip from "./noticeStrip";
import { getChromeSurface, setChromeSurface, nextSurfaceId } from "./chrome/chromeStore";

let showListener: ((n: ShellNotice) => void) | null = null;
let hideListener: (() => void) | null = null;
let setActiveRegion: ReturnType<typeof vi.fn>;

const notice = (over: Partial<ShellNotice> = {}): ShellNotice => ({
    id: "file-handler",
    displayId: null,
    title: "Android",
    message: "Reading IG.apk…",
    tone: "info",
    busy: false,
    pill: false,
    action: null,
    confirm: null,
    ...over,
});

beforeEach(() => {
    setChromeSurface(null);
    setActiveRegion = vi.fn();
    (window as unknown as { notice: unknown }).notice = {
        current: () => Promise.resolve(null),
        onShow: (cb: (n: ShellNotice) => void) => {
            showListener = cb;
            return () => {
                showListener = null;
            };
        },
        onHide: (cb: () => void) => {
            hideListener = cb;
            return () => {
                hideListener = null;
            };
        },
        runAction: vi.fn(),
        confirm: vi.fn(),
        dismiss: vi.fn(),
    };
    (window as unknown as { topbar: unknown }).topbar = { setActiveRegion };
});

afterEach(() => {
    setChromeSurface(null);
    vi.useRealTimers();
});

async function emit(next: ShellNotice) {
    await act(async () => {
        showListener?.(next);
    });
}

describe("NoticeStrip as a chrome surface", () => {
    it("claims the topbar chrome instead of drawing its own card", async () => {
        render(<NoticeStrip />);
        await emit(notice({ confirm: { label: "Install", cancelLabel: "Cancel" } }));
        await waitFor(() => expect(getChromeSurface()).not.toBeNull());
        expect(getChromeSurface()).toMatchObject({ anchor: "center" });
        expect(getChromeSurface()?.contentEl).toBeTruthy();
    });

    it("ignores a pill entirely: progress belongs in the bar, not in a surface", async () => {
        render(<NoticeStrip />);
        await emit(notice({ pill: true, busy: true }));
        expect(getChromeSurface()).toBeNull();
        expect(setActiveRegion).not.toHaveBeenCalledWith(expect.objectContaining({ top: 24 }));
    });

    it("gives the chrome back when a question is replaced by a pill", async () => {
        render(<NoticeStrip />);
        await emit(notice({ confirm: { label: "Install", cancelLabel: "Cancel" } }));
        await waitFor(() => expect(getChromeSurface()).not.toBeNull());
        await emit(notice({ pill: true, busy: true, confirm: null }));
        expect(getChromeSurface()).toBeNull();
        expect(setActiveRegion).toHaveBeenLastCalledWith(null);
    });

    it("claims a mouse region for a question", async () => {
        render(<NoticeStrip />);
        await emit(notice({ confirm: { label: "Update", cancelLabel: "Cancel" } }));
        await waitFor(() => expect(setActiveRegion).toHaveBeenCalledWith(expect.objectContaining({ top: 24 })));
    });

    it("releases chrome and region when the notice hides", async () => {
        render(<NoticeStrip />);
        await emit(notice({ confirm: { label: "Go", cancelLabel: "No" } }));
        await waitFor(() => expect(getChromeSurface()).not.toBeNull());
        await act(async () => {
            hideListener?.();
        });
        expect(getChromeSurface()).toBeNull();
        expect(setActiveRegion).toHaveBeenLastCalledWith(null);
    });

    it("yields the chrome when another surface supersedes it, and takes it back after", async () => {
        render(<NoticeStrip />);
        await emit(notice({ confirm: { label: "Go", cancelLabel: "No" } }));
        await waitFor(() => expect(getChromeSurface()).not.toBeNull());
        const mine = getChromeSurface()?.id;
        const noticeRegion = setActiveRegion.mock.calls.at(-1)?.[0];

        const other = nextSurfaceId();
        await act(async () => {
            setChromeSurface({
                id: other,
                centerX: 100,
                bodyWidth: 100,
                fullHeight: 100,
                anchor: "center",
                contentEl: null,
            });
        });
        expect(getChromeSurface()?.id).toBe(other);
        expect(setActiveRegion).not.toHaveBeenCalledWith(null);

        await act(async () => {
            setChromeSurface(null);
        });
        await waitFor(() => expect(getChromeSurface()?.id).toBe(mine));
        expect(setActiveRegion).toHaveBeenLastCalledWith(noticeRegion);
    });

    it("does not clear the region when it hides while another surface owns it", async () => {
        render(<NoticeStrip />);
        await emit(notice({ confirm: { label: "Go", cancelLabel: "No" } }));
        await waitFor(() => expect(getChromeSurface()).not.toBeNull());

        await act(async () => {
            setChromeSurface({
                id: nextSurfaceId(),
                centerX: 100,
                bodyWidth: 100,
                fullHeight: 100,
                anchor: "center",
                contentEl: null,
            });
        });
        await act(async () => {
            hideListener?.();
        });

        expect(setActiveRegion).not.toHaveBeenCalledWith(null);
    });

    it("ignores a notice aimed at another display", async () => {
        render(<NoticeStrip />);
        await emit(notice({ displayId: 4242 }));
        expect(getChromeSurface()).toBeNull();
    });
});
