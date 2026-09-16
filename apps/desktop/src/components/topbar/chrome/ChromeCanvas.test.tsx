import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import ChromeCanvas from "./ChromeCanvas";
import { setChromeSurface, nextSurfaceId, type ChromeSurface } from "./chromeStore";

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
});
