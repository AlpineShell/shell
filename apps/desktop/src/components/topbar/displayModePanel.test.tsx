import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import DisplayModePanel from "./displayModePanel";
import { getChromeSurface, setChromeSurface } from "./chrome/chromeStore";

let showListener: ((payload: DisplayModePickerPayload) => void) | null = null;
let hideListener: (() => void) | null = null;
let selectionListener: ((mode: DisplayMode) => void) | null = null;
let choose: ReturnType<typeof vi.fn>;
let dismiss: ReturnType<typeof vi.fn>;

const EVERY_MODE: DisplayMode[] = ["internal", "clone", "extend", "external"];

function payload(over: Partial<DisplayModePickerPayload> = {}): DisplayModePickerPayload {
    return {
        options: EVERY_MODE.map((mode) => ({ mode, available: true })),
        currentMode: "extend",
        selectedMode: "extend",
        ...over,
    };
}

beforeEach(() => {
    setChromeSurface(null);
    choose = vi.fn();
    dismiss = vi.fn();
    (window as unknown as { displayMode: unknown }).displayMode = {
        onShow: (cb: (p: DisplayModePickerPayload) => void) => {
            showListener = cb;
            return () => { showListener = null; };
        },
        onHide: (cb: () => void) => {
            hideListener = cb;
            return () => { hideListener = null; };
        },
        onSelectionChanged: (cb: (mode: DisplayMode) => void) => {
            selectionListener = cb;
            return () => { selectionListener = null; };
        },
        choose,
        dismiss,
    };
});

afterEach(() => {
    setChromeSurface(null);
    vi.useRealTimers();
});

async function show(next: DisplayModePickerPayload = payload()) {
    render(<DisplayModePanel />);
    await act(async () => {
        showListener?.(next);
    });
}

function tile(label: string) {
    return screen.getByRole("option", { name: new RegExp(label) });
}

describe("DisplayModePanel", () => {
    it("draws nothing until Win+P opens it", () => {
        render(<DisplayModePanel />);
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(getChromeSurface()).toBeNull();
    });

    it("grows out of the ridge with the four Windows display modes in order", async () => {
        await show();
        expect(getChromeSurface()).not.toBeNull();
        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
            "PC screen only",
            "Duplicate",
            expect.stringContaining("Extend"),
            "Second screen only",
        ]);
    });

    it("highlights the selected mode and marks the current one", async () => {
        await show(payload({ currentMode: "extend", selectedMode: "clone" }));
        expect(tile("Duplicate").getAttribute("aria-selected")).toBe("true");
        expect(tile("Extend").getAttribute("aria-selected")).toBe("false");
        expect(screen.getByLabelText("Current").closest("button")).toBe(tile("Extend"));
    });

    it("follows the selection as P cycles through the modes", async () => {
        await show();
        await act(async () => {
            selectionListener?.("external");
        });
        expect(tile("Second screen only").getAttribute("aria-selected")).toBe("true");
    });

    it("switches to a mode when its tile is clicked", async () => {
        await show();
        fireEvent.click(tile("Duplicate"));
        expect(choose).toHaveBeenCalledWith("clone");
    });

    it("dims a mode that needs a second screen and ignores clicks on it", async () => {
        await show(payload({
            options: EVERY_MODE.map((mode) => ({ mode, available: mode === "internal" })),
            currentMode: "internal",
            selectedMode: "internal",
        }));
        expect(tile("Duplicate").getAttribute("aria-disabled")).toBe("true");
        fireEvent.click(tile("Duplicate"));
        expect(choose).not.toHaveBeenCalled();
    });

    it("closes when you click outside it", async () => {
        await show();
        fireEvent.pointerDown(screen.getByTestId("display-mode-backdrop"));
        expect(dismiss).toHaveBeenCalled();
    });

    it("hands the ridge back and unmounts after the close animation", async () => {
        vi.useFakeTimers();
        await show();
        await act(async () => {
            hideListener?.();
        });
        expect(getChromeSurface()).toBeNull();
        expect(screen.queryByTestId("display-mode-backdrop")).toBeNull();
        await act(async () => {
            vi.advanceTimersByTime(300);
        });
        expect(screen.queryByRole("listbox")).toBeNull();
    });
});
