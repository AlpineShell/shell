import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import ChromeCanvas from "./ChromeCanvas";
import { setChromeSurface, setSurfaceBackdrop, nextSurfaceId, type ChromeSurface } from "./chromeStore";

const painted: string[] = [];

const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(() => painted.push("stroke")),
    save: vi.fn(),
    restore: vi.fn(() => painted.push("restore")),
    clip: vi.fn(() => painted.push("clip")),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
};

const WINDOW_UNDER_RIDGE: TopbarRegionBounds = { left: 0, top: 24, right: 600, bottom: 900 };

function surface(fullHeight: number): ChromeSurface {
    return {
        id: nextSurfaceId(),
        centerX: 480,
        bodyWidth: 600,
        fullHeight,
        anchor: "center",
        contentEl: null,
    };
}

describe("ChromeCanvas", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        painted.length = 0;
        for (const call of [context.clearRect, context.stroke, context.save, context.restore, context.clip]) call.mockClear();
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            context as unknown as CanvasRenderingContext2D
        );
        globalThis.Path2D = class {} as unknown as typeof Path2D;
    });

    afterEach(() => {
        setChromeSurface(null);
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("repaints in the same turn that a growing surface reallocates the canvas", () => {
        render(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[]} />);

        act(() => setChromeSurface(surface(48)));
        context.clearRect.mockClear();

        act(() => setChromeSurface(surface(460)));

        expect(context.clearRect).toHaveBeenCalled();
    });

    it("draws no border while no window lies under the Ridge", () => {
        render(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={true} windowCoverage={[]} />);

        expect(context.stroke).not.toHaveBeenCalled();
    });

    it("draws the border clipped to the windows under the Ridge", () => {
        render(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={true} windowCoverage={[WINDOW_UNDER_RIDGE]} />);

        expect(painted).toEqual(["clip", "stroke", "restore"]);
    });

    it("draws no border over windows while the Ridge is neither hovered nor showing a surface", () => {
        render(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[WINDOW_UNDER_RIDGE]} />);

        expect(context.stroke).not.toHaveBeenCalled();
    });

    it("repaints the border when a window moves under the Ridge", () => {
        const { rerender } = render(
            <ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={true} windowCoverage={[]} />
        );

        rerender(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={true} windowCoverage={[WINDOW_UNDER_RIDGE]} />);
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(context.stroke).toHaveBeenCalled();
    });

    it("draws a registered backdrop into the bar and its shoulders, fading with the surface", () => {
        let now = 1000;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        render(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[]} />);
        const content = document.createElement("div");
        const backdrop = document.createElement("div");
        vi.spyOn(backdrop, "getBoundingClientRect").mockReturnValue({ left: 140, right: 540, top: 0, bottom: 0, width: 400, height: 0, x: 140, y: 0, toJSON: () => ({}) } as DOMRect);
        setSurfaceBackdrop(content, backdrop);

        act(() => setChromeSurface({ ...surface(90), centerX: 340, bodyWidth: 320, contentEl: content }));
        now += 2000;
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(backdrop.style.clipPath.startsWith('path("M0 0')).toBe(true);
        expect((backdrop.style.clipPath.match(/A14 14/g) || []).length).toBe(2);
        expect(backdrop.style.opacity).toBe("1");

        act(() => setChromeSurface(null));
        now += 2000;
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(backdrop.style.opacity).toBe("0");
        setSurfaceBackdrop(content, null);
    });
});
