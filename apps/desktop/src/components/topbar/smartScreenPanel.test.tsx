import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import SmartScreenPanel from "./smartScreenPanel";
import { getChromeSurface, setChromeSurface } from "./chrome/chromeStore";

let showListener: ((prompt: SmartScreenPrompt) => void) | null = null;
let hideListener: (() => void) | null = null;
let answer: ReturnType<typeof vi.fn>;

function prompt(over: Partial<SmartScreenPrompt> = {}): SmartScreenPrompt {
    return {
        id: 3,
        title: "Windows protected your PC",
        message: "Microsoft Defender SmartScreen prevented an unrecognised app from starting.",
        details: [
            { label: "Application", value: "setup.exe" },
            { label: "Publisher", value: "Unknown publisher" },
        ],
        runLabel: "Run anyway",
        dontRunLabel: "Don't run",
        ...over,
    };
}

beforeEach(() => {
    setChromeSurface(null);
    answer = vi.fn();
    (window as unknown as { smartScreen: unknown }).smartScreen = {
        onShow: (cb: (p: SmartScreenPrompt) => void) => {
            showListener = cb;
            return () => { showListener = null; };
        },
        onHide: (cb: () => void) => {
            hideListener = cb;
            return () => { hideListener = null; };
        },
        answer,
    };
});

afterEach(() => {
    setChromeSurface(null);
    vi.useRealTimers();
});

async function show(next: SmartScreenPrompt = prompt()) {
    render(<SmartScreenPanel />);
    await act(async () => {
        showListener?.(next);
    });
}

describe("SmartScreenPanel", () => {
    it("draws nothing until SmartScreen asks", () => {
        render(<SmartScreenPanel />);
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(getChromeSurface()).toBeNull();
    });

    it("shows the warning, the app and its publisher straight away", async () => {
        await show();
        expect(getChromeSurface()).not.toBeNull();
        expect(screen.getByText("Windows protected your PC")).toBeTruthy();
        expect(screen.getByText("setup.exe")).toBeTruthy();
        expect(screen.getByText("Unknown publisher")).toBeTruthy();
    });

    it("runs the app when SmartScreen offers Run anyway", async () => {
        await show();
        fireEvent.click(screen.getByRole("button", { name: "Run anyway" }));
        expect(answer).toHaveBeenCalledWith(3, "run");
    });

    it("greys out Run anyway when SmartScreen does not offer it", async () => {
        await show(prompt({ runLabel: "" }));
        const run = screen.getByRole("button", { name: "Run anyway" }) as HTMLButtonElement;
        expect(run.disabled).toBe(true);
        fireEvent.click(run);
        expect(answer).not.toHaveBeenCalled();
    });

    it("answers Don't run", async () => {
        await show();
        fireEvent.click(screen.getByRole("button", { name: "Don't run" }));
        expect(answer).toHaveBeenCalledWith(3, "norun");
    });

    it("falls back to the Windows wording when the prompt has none", async () => {
        await show(prompt({ title: "", dontRunLabel: "" }));
        expect(screen.getByText("Windows protected your PC")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Don't run" })).toBeTruthy();
    });

    it("unmounts after the close animation", async () => {
        vi.useFakeTimers();
        await show();
        await act(async () => {
            hideListener?.();
        });
        await act(async () => {
            vi.advanceTimersByTime(300);
        });
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(getChromeSurface()).toBeNull();
    });
});
