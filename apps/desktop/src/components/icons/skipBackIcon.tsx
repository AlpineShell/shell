import { motion, type Variants } from "motion/react";
import { useIconAnimation } from "../../hooks/useIconAnimation";

const SKIP_TIMING = { duration: 0.45, times: [0, 0.4, 1] };

const ARROW: Variants = {
    normal: { x: 0 },
    animate: { x: [0, -2.5, 0], transition: SKIP_TIMING },
};

const STOP: Variants = {
    normal: { x: 0 },
    animate: { x: [0, -1, 0], transition: SKIP_TIMING },
};

export function SkipBackIcon({ ref, size = 24 }: AnimatedIconProps) {
    const controls = useIconAnimation(ref);
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" variants={ARROW} animate={controls} />
            <motion.path d="M3 20V4" variants={STOP} animate={controls} />
        </svg>
    );
}
