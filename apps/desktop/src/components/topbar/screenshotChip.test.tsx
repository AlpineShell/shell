import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import ScreenshotChip from "./screenshotChip";

let savedListener: ((saved: ScreenshotSaved) => void) | null = null;
let reveal: ReturnType<typeof vi.fn<(id: number) => Promise<{ ok: boolean }>>>;

const SAVED: ScreenshotSaved = {
    id: 4,
    thumbnail: "data:image/png;base64,AAAA",
    name: "2026-11-11 20.05.12.png",
    displayId: null,
};

function save(saved: ScreenshotSaved = SAVED) {
    act(() => {
        savedListener?.(saved);
    });
}

function hoverTarget() {
    return screen.getByRole("status").firstElementChild as HTMLElement;
}

function chipWidth() {
    return parseFloat(screen.getByRole("status").style.width);
}

function wait(ms: number) {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    savedListener = null;
    reveal = vi.fn<(id: number) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true });
    (window as unknown as { screenshot: unknown }).screenshot = {
        reveal,
        onSaved: (callback: (saved: ScreenshotSaved) => void) => {
            savedListener = callback;
            return () => {
                savedListener = null;
            };
        },
    };
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("ScreenshotChip", () => {
    it("shows nothing until a screenshot is saved", () => {
        render(<ScreenshotChip />);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows the thumbnail and the file name", () => {
        render(<ScreenshotChip />);
        save();
        const chip = screen.getByRole("status");
        expect(chip.querySelector("img")?.getAttribute("src")).toBe(SAVED.thumbnail);
        expect(chip.textContent).toBe(SAVED.name);
    });

    it("opens the file in File Explorer when clicked and then leaves", () => {
        render(<ScreenshotChip />);
        save();
        fireEvent.click(hoverTarget());
        expect(reveal).toHaveBeenCalledWith(4);
        wait(2000);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("takes the pointer only on the thumbnail and path, not on its own edges", () => {
        render(<ScreenshotChip />);
        save();
        expect(screen.getByRole("status").className).toContain("pointer-events-none");
        expect(hoverTarget().className).toContain("pointer-events-auto");
        expect(hoverTarget().className).toContain("cursor-pointer");
    });

    it("does not open again when its own edge springs back under a pointer that has not moved", () => {
        vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
        render(<ScreenshotChip />);
        save();
        fireEvent.pointerEnter(hoverTarget(), { clientX: 60, clientY: 12 });
        wait(1000);
        expect(chipWidth()).toBe(139);
        fireEvent.pointerLeave(hoverTarget(), { clientX: 20, clientY: 12 });
        wait(30);
        fireEvent.pointerEnter(hoverTarget(), { clientX: 20, clientY: 12 });
        wait(1000);
        expect(chipWidth()).toBe(39);
    });

    it("opens again straight away when the pointer comes back while it is still closing", () => {
        vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
        render(<ScreenshotChip />);
        save();
        fireEvent.pointerEnter(hoverTarget(), { clientX: 60, clientY: 12 });
        wait(1000);
        fireEvent.pointerLeave(hoverTarget(), { clientX: 200, clientY: 12 });
        wait(30);
        fireEvent.pointerEnter(hoverTarget(), { clientX: 120, clientY: 12 });
        wait(1000);
        expect(chipWidth()).toBe(139);
    });

    it("opens once the pointer moves after an entry it ignored", () => {
        vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
        render(<ScreenshotChip />);
        save();
        fireEvent.pointerEnter(hoverTarget(), { clientX: 60, clientY: 12 });
        wait(1000);
        fireEvent.pointerLeave(hoverTarget(), { clientX: 20, clientY: 12 });
        fireEvent.pointerEnter(hoverTarget(), { clientX: 20, clientY: 12 });
        fireEvent.pointerMove(hoverTarget(), { clientX: 30, clientY: 12 });
        wait(1000);
        expect(chipWidth()).toBe(139);
    });

    it("ignores a screenshot taken on another display", () => {
        render(<ScreenshotChip />);
        save({ ...SAVED, displayId: 4242 });
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("leaves the Ridge on its own after a few seconds", () => {
        render(<ScreenshotChip />);
        save();
        wait(4000);
        expect(screen.queryByRole("status")).not.toBeNull();
        wait(1500);
        wait(2000);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("takes no room and shows nothing while tucked away behind the control center", () => {
        render(<ScreenshotChip />);
        save();
        const chip = screen.getByRole("status");
        const room = parseFloat(chip.style.width) + parseFloat(chip.style.marginRight) + 4;
        expect(room).toBe(0);
        expect(chip.style.opacity).toBe("0");
    });

    it("comes out from behind the control center to its collapsed size", () => {
        render(<ScreenshotChip />);
        save();
        wait(1500);
        const chip = screen.getByRole("status");
        expect(chip.style.width).toBe("39px");
        expect(chip.style.marginRight).toBe("-13px");
    });

    it("stays while hovered and leaves shortly after the pointer does", () => {
        render(<ScreenshotChip />);
        save();
        fireEvent.pointerEnter(hoverTarget());
        wait(10000);
        expect(screen.queryByRole("status")).not.toBeNull();
        fireEvent.pointerLeave(hoverTarget());
        wait(2500);
        wait(2000);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("starts over when another screenshot is saved", () => {
        render(<ScreenshotChip />);
        save();
        wait(4000);
        save({ ...SAVED, thumbnail: "data:image/png;base64,BBBB" });
        wait(4000);
        expect(screen.getByRole("status").querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,BBBB");
    });
});
