import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import PopupMenu from "./popupMenu";
import { rearmMenuRegion } from "./menuRegion";
import { getChromeSurface, setChromeSurface } from "../chrome/chromeStore";

let closeMenus: (() => void) | null = null;
let setActiveRegion: ReturnType<typeof vi.fn>;
let resizeObservers: Set<ResizeObserverCallback>;
let bodyHeight = 120;

function stubResizeObserver() {
    resizeObservers = new Set();
    class ResizeObserverStub {
        callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
            this.callback = callback;
        }
        observe() {
            resizeObservers.add(this.callback);
        }
        unobserve() {}
        disconnect() {
            resizeObservers.delete(this.callback);
        }
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
}

function growMenuBody(height: number) {
    bodyHeight = height;
    act(() => resizeObservers.forEach((callback) => callback([], {} as ResizeObserver)));
}

function renderMenu() {
    const { container } = render(
        <PopupMenu trigger={<span>Trigger</span>}>
            <div>Menu content</div>
        </PopupMenu>,
    );
    return container.firstElementChild as HTMLElement;
}

const lastRegion = () => setActiveRegion.mock.calls.at(-1)?.[0];

beforeEach(() => {
    vi.useFakeTimers();
    bodyHeight = 120;
    setChromeSurface(null);
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        () => ({ left: 100, top: 0, right: 300, bottom: bodyHeight, width: 200, height: bodyHeight, x: 100, y: 0, toJSON() {} }) as DOMRect,
    );
    setActiveRegion = vi.fn();
    (window as unknown as { topbar: unknown }).topbar = {
        setActiveRegion,
        onCloseMenus: (callback: () => void) => {
            closeMenus = callback;
            return () => {
                closeMenus = null;
            };
        },
    };
});

afterEach(() => {
    setChromeSurface(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("PopupMenu closing", () => {
    it("closes completely when the content changes size while the menu is closing", () => {
        const trigger = renderMenu();
        fireEvent.mouseEnter(trigger);
        expect(getChromeSurface()).not.toBeNull();

        act(() => closeMenus?.());
        growMenuBody(240);
        act(() => vi.advanceTimersByTime(1000));

        expect(getChromeSurface()).toBeNull();
        expect(lastRegion()).toBeNull();
    });

    it("opens again when the pointer comes back while the menu is closing", () => {
        const trigger = renderMenu();
        fireEvent.mouseEnter(trigger);
        act(() => closeMenus?.());

        fireEvent.mouseEnter(trigger);
        act(() => vi.advanceTimersByTime(1000));

        expect(getChromeSurface()).not.toBeNull();
        expect(lastRegion()).not.toBeNull();
    });
});

describe("PopupMenu region", () => {
    it("arms the open menu's region again after another surface borrowed it", () => {
        const trigger = renderMenu();
        fireEvent.mouseEnter(trigger);
        const menuRegion = lastRegion();
        setActiveRegion({ top: 0, bottom: 240, left: 0, right: 1920 });

        rearmMenuRegion();

        expect(menuRegion).not.toBeNull();
        expect(lastRegion()).toEqual(menuRegion);
    });

    it("takes the chrome and its region back when the surface that superseded it goes away", () => {
        const trigger = renderMenu();
        fireEvent.mouseEnter(trigger);
        const menuSurfaceId = getChromeSurface()?.id;
        const menuRegion = lastRegion();

        act(() =>
            setChromeSurface({ id: 9999, centerX: 100, bodyWidth: 100, fullHeight: 60, anchor: "center", contentEl: null }),
        );
        setActiveRegion({ top: 24, bottom: 84, left: 0, right: 200 });
        act(() => {
            setChromeSurface(null);
            setActiveRegion(null);
        });

        expect(getChromeSurface()?.id).toBe(menuSurfaceId);
        expect(lastRegion()).toEqual(menuRegion);
    });

    it("leaves the superseding surface's region alone while it is hidden", () => {
        const trigger = renderMenu();
        fireEvent.mouseEnter(trigger);
        growMenuBody(60);

        act(() =>
            setChromeSurface({ id: 9999, centerX: 100, bodyWidth: 100, fullHeight: 60, anchor: "center", contentEl: null }),
        );
        const noticeRegion = { top: 24, bottom: 84, left: 0, right: 200 };
        setActiveRegion(noticeRegion);
        act(() => vi.advanceTimersByTime(1000));

        expect(lastRegion()).toEqual(noticeRegion);
    });

    it("takes the chrome over when the pointer moves on from another open menu", () => {
        const { getByText } = render(
            <div>
                <PopupMenu trigger={<span>First</span>}>
                    <div>First content</div>
                </PopupMenu>
                <PopupMenu trigger={<span>Second</span>}>
                    <div>Second content</div>
                </PopupMenu>
            </div>,
        );
        fireEvent.mouseEnter(getByText("First").parentElement!.parentElement!);
        const firstSurfaceId = getChromeSurface()?.id;

        fireEvent.mouseEnter(getByText("Second").parentElement!.parentElement!);

        expect(getChromeSurface()?.id).not.toBe(firstSurfaceId);
        expect(getChromeSurface()?.contentEl?.textContent).toBe("Second content");
        expect(getChromeSurface()?.contentEl?.style.visibility).not.toBe("hidden");
        expect(lastRegion()?.bottom).toBeLessThan(window.innerHeight);
    });

    it("takes the chrome when it opens while another surface holds it", () => {
        act(() =>
            setChromeSurface({ id: 9999, centerX: 100, bodyWidth: 100, fullHeight: 60, anchor: "center", contentEl: null }),
        );
        const trigger = renderMenu();

        fireEvent.mouseEnter(trigger);

        expect(getChromeSurface()?.id).not.toBe(9999);
        expect(getChromeSurface()?.contentEl?.textContent).toBe("Menu content");
    });

    it("clears the region when no menu is open to take it back", () => {
        const trigger = renderMenu();
        fireEvent.mouseEnter(trigger);
        act(() => closeMenus?.());
        setActiveRegion({ top: 0, bottom: 240, left: 0, right: 1920 });

        rearmMenuRegion();

        expect(lastRegion()).toBeNull();
    });
});
