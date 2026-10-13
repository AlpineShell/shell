import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import WindowSwitcherPanel from "./windowSwitcherPanel";
import { setChromeSurface } from "./chrome/chromeStore";

let showListener: ((payload: SwitcherShowPayload) => void) | null = null;
let thumbnailListener: ((payload: SwitcherThumbnailPayload) => void) | null = null;

const ICON = "data:image/png;base64,aWNvbg==";
const CACHED = "data:image/png;base64,Y2FjaGVk";
const FRESH = "data:image/png;base64,ZnJlc2g=";

function entry(hwnd: number, thumbnail: string): SwitcherWindow {
    return { hwnd, title: `Window ${hwnd}`, processName: `App ${hwnd}`, icon: ICON, thumbnail };
}

function imageSources() {
    return Array.from(document.body.querySelectorAll("img")).map((image) => image.getAttribute("src"));
}

beforeEach(() => {
    setChromeSurface(null);
    (window as unknown as { windowSwitcher: unknown }).windowSwitcher = {
        onShow: (cb: (payload: SwitcherShowPayload) => void) => {
            showListener = cb;
        },
        onHide: () => {},
        onSelectionChanged: () => {},
        onThumbnail: (cb: (payload: SwitcherThumbnailPayload) => void) => {
            thumbnailListener = cb;
        },
        activate: vi.fn(),
    };
});

afterEach(() => {
    setChromeSurface(null);
    showListener = null;
    thumbnailListener = null;
});

async function show(windows: SwitcherWindow[]) {
    render(<WindowSwitcherPanel />);
    await act(async () => {
        showListener?.({ windows, selectedIndex: 1 });
    });
}

describe("WindowSwitcherPanel", () => {
    it("opens with the cached thumbnails and the icon where none is cached yet", async () => {
        await show([entry(1, CACHED), entry(2, "")]);
        expect(imageSources()).toEqual([ICON, CACHED, ICON, ICON]);
    });

    it("swaps in a thumbnail that arrives after the switcher opened", async () => {
        await show([entry(1, CACHED), entry(2, "")]);
        await act(async () => {
            thumbnailListener?.({ hwnd: 2, thumbnail: FRESH });
        });
        expect(imageSources()).toEqual([ICON, CACHED, ICON, FRESH]);
        await act(async () => {
            thumbnailListener?.({ hwnd: 1, thumbnail: FRESH });
        });
        expect(imageSources()).toEqual([ICON, FRESH, ICON, FRESH]);
    });

    it("ignores a thumbnail for a window that is not in the switcher", async () => {
        await show([entry(1, CACHED)]);
        await act(async () => {
            thumbnailListener?.({ hwnd: 99, thumbnail: FRESH });
        });
        expect(imageSources()).toEqual([ICON, CACHED]);
    });
});
