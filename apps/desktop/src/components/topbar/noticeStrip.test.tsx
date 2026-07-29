import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import NoticeStrip from "./noticeStrip";
import { getSurface, setSurface, nextSurfaceId } from "./engine/surfaceStore";

let showListener: ((n: ShellNotice) => void) | null = null;
let hideListener: (() => void) | null = null;
let setActiveRegion: ReturnType<typeof vi.fn>;

const notice = (over: Partial<ShellNotice> = {}): ShellNotice => ({
    id: "file-handler",
    displayId: null,
    title: "Android",
    message: "Reading IG.apk…",
    tone: "info",
    busy: true,
    pill: true,
    action: null,
    confirm: null,
    ...over,
});

beforeEach(() => {
    setSurface(null);
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
    setSurface(null);
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
        await emit(notice());
        await waitFor(() => expect(getSurface()).not.toBeNull());
        expect(getSurface()).toMatchObject({ anchor: "center" });
        expect(getSurface()?.contentEl).toBeTruthy();
    });

    it("takes no mouse region for a pill, so a long install stays click-through", async () => {
        render(<NoticeStrip />);
        await emit(notice({ pill: true }));
        await waitFor(() => expect(getSurface()).not.toBeNull());
        expect(setActiveRegion).not.toHaveBeenCalledWith(expect.objectContaining({ top: 24 }));
    });

    it("claims a mouse region for a question", async () => {
        render(<NoticeStrip />);
        await emit(notice({ pill: false, busy: false, confirm: { label: "Update", cancelLabel: "Cancel" } }));
        await waitFor(() => expect(setActiveRegion).toHaveBeenCalledWith(expect.objectContaining({ top: 24 })));
    });

    it("releases chrome and region when the notice hides", async () => {
        render(<NoticeStrip />);
        await emit(notice({ pill: false, busy: false, confirm: { label: "Go", cancelLabel: "No" } }));
        await waitFor(() => expect(getSurface()).not.toBeNull());
        await act(async () => {
            hideListener?.();
        });
        expect(getSurface()).toBeNull();
        expect(setActiveRegion).toHaveBeenLastCalledWith(null);
    });

    it("yields the chrome when another surface supersedes it, and takes it back after", async () => {
        render(<NoticeStrip />);
        await emit(notice({ pill: false, busy: false, confirm: { label: "Go", cancelLabel: "No" } }));
        await waitFor(() => expect(getSurface()).not.toBeNull());
        const mine = getSurface()?.id;

        const other = nextSurfaceId();
        await act(async () => {
            setSurface({
                id: other,
                centerX: 100,
                bodyWidth: 100,
                fullHeight: 100,
                outline: false,
                anchor: "center",
                contentEl: null,
            });
        });
        expect(getSurface()?.id).toBe(other);
        expect(setActiveRegion).toHaveBeenLastCalledWith(null);

        await act(async () => {
            setSurface(null);
        });
        await waitFor(() => expect(getSurface()?.id).toBe(mine));
    });

    it("ignores a notice aimed at another display", async () => {
        render(<NoticeStrip />);
        await emit(notice({ displayId: 4242 }));
        expect(getSurface()).toBeNull();
    });
});
