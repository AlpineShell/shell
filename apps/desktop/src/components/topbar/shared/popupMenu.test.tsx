import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import PopupMenu from "./popupMenu";
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
