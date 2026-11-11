export interface SpringConfig {
    response: number;
    damping: number;
}

export interface Spring {
    value: number;
    velocity: number;
    target: number;
    precision: number;
}

export const SURFACE_SPRING: SpringConfig = { response: 0.5, damping: 0.74 };

const STEPS_PER_SECOND = 480;
const LONGEST_STEP_SECONDS = 5;
const VELOCITY_PRECISION_FACTOR = 10;

export function createSpring(value: number, precision: number): Spring {
    return { value, velocity: 0, target: value, precision };
}

export function snapSpring(spring: Spring, value: number): void {
    spring.value = value;
    spring.target = value;
    spring.velocity = 0;
}

export function isSpringResting(spring: Spring): boolean {
    return (
        Math.abs(spring.value - spring.target) < spring.precision &&
        Math.abs(spring.velocity) < spring.precision * VELOCITY_PRECISION_FACTOR
    );
}

export function stepSpring(spring: Spring, config: SpringConfig, seconds: number): void {
    if (isSpringResting(spring)) {
        snapSpring(spring, spring.target);
        return;
    }
    const span = Math.min(seconds, LONGEST_STEP_SECONDS);
    if (span <= 0) return;
    const angularFrequency = (2 * Math.PI) / config.response;
    const stiffness = angularFrequency * angularFrequency;
    const friction = 2 * config.damping * angularFrequency;
    const steps = Math.max(1, Math.ceil(span * STEPS_PER_SECOND));
    const step = span / steps;
    for (let i = 0; i < steps; i++) {
        const acceleration = -stiffness * (spring.value - spring.target) - friction * spring.velocity;
        spring.velocity += acceleration * step;
        spring.value += spring.velocity * step;
    }
    if (isSpringResting(spring)) snapSpring(spring, spring.target);
}
