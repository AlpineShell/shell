import { describe, expect, it } from "vitest";
import { SURFACE_SPRING, createSpring, isSpringResting, snapSpring, stepSpring } from "./chromeSpring";

const FRAME = 1 / 60;

function runFrames(spring: ReturnType<typeof createSpring>, frames: number) {
    const values: number[] = [];
    for (let i = 0; i < frames; i++) {
        stepSpring(spring, SURFACE_SPRING, FRAME);
        values.push(spring.value);
    }
    return values;
}

describe("chromeSpring", () => {
    it("settles exactly on its target and stops moving", () => {
        const spring = createSpring(0, 0.05);
        spring.target = 300;

        runFrames(spring, 120);

        expect(spring.value).toBe(300);
        expect(spring.velocity).toBe(0);
        expect(isSpringResting(spring)).toBe(true);
    });

    it("overshoots a little before it settles", () => {
        const spring = createSpring(0, 0.001);
        spring.target = 1;

        const peak = Math.max(...runFrames(spring, 120));

        expect(peak).toBeGreaterThan(1);
        expect(peak).toBeLessThan(1.1);
    });

    it("keeps its speed when the target changes mid-flight", () => {
        const spring = createSpring(0, 0.05);
        spring.target = 100;
        runFrames(spring, 6);
        const velocityBefore = spring.velocity;

        spring.target = 200;

        expect(spring.velocity).toBe(velocityBefore);
        expect(velocityBefore).toBeGreaterThan(0);
    });

    it("lands at rest when a long gap passes in one step", () => {
        const spring = createSpring(600, 0.05);
        spring.target = 320;

        stepSpring(spring, SURFACE_SPRING, 2);

        expect(spring.value).toBe(320);
        expect(isSpringResting(spring)).toBe(true);
    });

    it("does not move while resting", () => {
        const spring = createSpring(40, 0.05);
        snapSpring(spring, 40);

        stepSpring(spring, SURFACE_SPRING, FRAME);

        expect(spring.value).toBe(40);
    });
});
