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

    it("leaves the canvas alone when a window moves while no border is drawn", () => {
        const { rerender } = render(
            <ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[]} />
        );
        act(() => {
            vi.advanceTimersToNextFrame();
        });
        context.clearRect.mockClear();

        rerender(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[WINDOW_UNDER_RIDGE]} />);
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(context.clearRect).not.toHaveBeenCalled();
    });

    it("draws the border over a window that moved in while the Ridge was not hovered once it is hovered", () => {
        const { rerender } = render(
            <ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[]} />
        );
        rerender(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[WINDOW_UNDER_RIDGE]} />);
        act(() => {
            vi.advanceTimersToNextFrame();
        });
        expect(context.stroke).not.toHaveBeenCalled();

        rerender(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={true} windowCoverage={[WINDOW_UNDER_RIDGE]} />);
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(painted).toEqual(["clip", "stroke", "restore"]);
    });

    it("repaints when a window moves while a surface is open", () => {
        let now = 1000;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        const { rerender } = render(
            <ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[]} />
        );
        act(() => setChromeSurface(surface(90)));
        now += 2000;
        act(() => {
            vi.advanceTimersToNextFrame();
        });
        context.stroke.mockClear();

        rerender(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[WINDOW_UNDER_RIDGE]} />);
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(context.stroke).toHaveBeenCalled();
    });

    it("lays a registered backdrop over the bar and the surface shape, fading with the surface", () => {
        let now = 1000;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        render(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[]} />);
        const content = document.createElement("div");
        const bar = document.createElement("div");
        const under = document.createElement("div");
        setSurfaceBackdrop(content, { bar, surface: under });

        act(() => setChromeSurface({ ...surface(90), centerX: 340, bodyWidth: 320, contentEl: content }));
        now += 2000;
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(bar.style.clipPath).toBe("inset(0 0 calc(100% - 24px) 0)");
        expect(under.style.clipPath.startsWith('path("M')).toBe(true);
        expect((under.style.clipPath.match(/A14 14/g) || []).length).toBe(4);
        for (const layer of [bar, under]) {
            expect(layer.style.getPropertyValue("--chrome-left")).toBe("180px");
            expect(layer.style.getPropertyValue("--chrome-width")).toBe("320px");
            expect(layer.style.getPropertyValue("--chrome-height")).toBe("90px");
            expect(layer.style.opacity).toBe("1");
        }

        act(() => setChromeSurface(null));
        now += 2000;
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(bar.style.opacity).toBe("0");
        expect(under.style.opacity).toBe("0");
        setSurfaceBackdrop(content, null);
    });

    it("grows a backdrop with the shape and fades it in when another menu hands the Ridge over", () => {
        let now = 1000;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        render(<ChromeCanvas barHeight={24} bg="#1f2020" barBorderColor="#333" hovered={false} windowCoverage={[]} />);
        act(() => setChromeSurface({ ...surface(400), centerX: 800, bodyWidth: 600 }));
        now += 2000;
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        const content = document.createElement("div");
        const under = document.createElement("div");
        setSurfaceBackdrop(content, { bar: null, surface: under });
        act(() => setChromeSurface({ ...surface(90), centerX: 340, bodyWidth: 320, contentEl: content }));
        now += 40;
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        const midwayOpacity = Number(under.style.opacity);
        const midwayWidth = parseFloat(under.style.getPropertyValue("--chrome-width"));
        const midwayHeight = parseFloat(under.style.getPropertyValue("--chrome-height"));
        expect(midwayOpacity).toBeGreaterThan(0);
        expect(midwayOpacity).toBeLessThan(1);
        expect(midwayWidth).toBeGreaterThan(320);
        expect(midwayWidth).toBeLessThan(600);
        expect(midwayHeight).toBeGreaterThan(90);
        expect(midwayHeight).toBeLessThan(400);

        now += 2000;
        act(() => {
            vi.advanceTimersToNextFrame();
        });

        expect(under.style.opacity).toBe("1");
        expect(under.style.getPropertyValue("--chrome-width")).toBe("320px");
        expect(under.style.getPropertyValue("--chrome-height")).toBe("90px");
        setSurfaceBackdrop(content, null);
    });
});
