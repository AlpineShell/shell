import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SURFACE_SPRING, createSpring, isSpringResting, stepSpring } from "../components/topbar/chrome/chromeSpring";

const PIXEL_PRECISION = 0.05;

export function useSprings(
    initial: readonly number[],
    targets: readonly number[],
    onFrame: (values: number[]) => void,
    onRest?: () => void,
) {
    const [springs] = useState(() => initial.map((value) => createSpring(value, PIXEL_PRECISION)));
    const callbacks = useRef({ onFrame, onRest });
    const targetKey = targets.join(",");

    useLayoutEffect(() => {
        callbacks.current = { onFrame, onRest };
    });

    useEffect(() => {
        targetKey.split(",").forEach((target, index) => {
            springs[index].target = Number(target);
        });
        const currentValues = () => springs.map((spring) => spring.value);
        let frame = 0;
        let lastStepAt: number | null = null;

        const tick = (at: number) => {
            const seconds = lastStepAt === null ? 0 : (at - lastStepAt) / 1000;
            lastStepAt = at;
            for (const spring of springs) stepSpring(spring, SURFACE_SPRING, seconds);
            callbacks.current.onFrame(currentValues());
            if (springs.every(isSpringResting)) {
                callbacks.current.onRest?.();
                return;
            }
            frame = requestAnimationFrame(tick);
        };

        callbacks.current.onFrame(currentValues());
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [springs, targetKey]);
}
