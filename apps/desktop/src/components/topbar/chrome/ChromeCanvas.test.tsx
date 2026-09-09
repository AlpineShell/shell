import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import ChromeCanvas from "./ChromeCanvas";
import { setChromeSurface, nextSurfaceId, type ChromeSurface } from "./chromeStore";

const clearRect = vi.fn();

const context = {
    setTransform: vi.fn(),
    clearRect,
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
};

function surface(fullHeight: number): ChromeSurface {
    return {
        id: nextSurfaceId(),
        centerX: 480,
        bodyWidth: 600,
        fullHeight,
        outline: false,
        anchor: "center",
        contentEl: null,
    };
}

describe("ChromeCanvas", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        clearRect.mockClear();
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
        render(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} />);

        act(() => setChromeSurface(surface(48)));
        clearRect.mockClear();

        act(() => setChromeSurface(surface(460)));

        expect(clearRect).toHaveBeenCalled();
    });
});
