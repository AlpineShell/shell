import { useEffect, useRef } from "react";
import { surfaceFillPath, RADIUS, type ChromeAnchor } from "./chromeShape";

const OPEN_MS = 460;
const CLOSE_MS = 300;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInCubic = (t: number) => t * t * t;

export interface ToastSurface {
    centerX: number;
    bodyWidth: number;
    fullHeight: number;
    anchor: ChromeAnchor;
    contentEl: HTMLElement | null;
}

interface ToastChromeProps {
    barHeight: number;
    bg: string;
    borderColor: string;
    surface: ToastSurface | null;
}

export default function ToastChrome({ barHeight, bg, borderColor, surface }: ToastChromeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const propsRef = useRef({ barHeight, bg, borderColor, surface });
    propsRef.current = { barHeight, bg, borderColor, surface };
    const kickRef = useRef<(() => void) | undefined>(undefined);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        let openValue = 0;
        let from = 0;
        let to = 0;
        let start = -1;
        let dur = OPEN_MS;
        let ease: "out" | "in" = "out";
        let lastSurface: ToastSurface | null = null;
        let cx = 0;
        let half = 0;
        let fullH = 0;
        let anchor: ChromeAnchor = "center";
        let contentEl: HTMLElement | null = null;
        let lastClearH = 0;
        let running = false;
        let raf = 0;

        const now = () => performance.now();
        const sample = () => {
            if (start < 0) return to;
            const t = Math.min(1, (now() - start) / dur);
            const eased = ease === "out" ? easeOutExpo(t) : easeInCubic(t);
            return from + (to - from) * eased;
        };
        const animate = (target: number, d: number, e: "out" | "in") => {
            from = sample();
            to = target;
            start = now();
            dur = d;
            ease = e;
        };

        const resize = () => {
            canvas.width = Math.round(window.innerWidth * dpr);
            canvas.height = Math.round(window.innerHeight * dpr);
            kick();
        };

        const draw = () => {
            const p = propsRef.current;
            const screenW = window.innerWidth;
            const barBottom = p.barHeight;
            const s = p.surface;

            if (s !== lastSurface) {
                const prev = lastSurface;
                lastSurface = s;
                if (s && !prev) animate(1, OPEN_MS, "out");
                else if (!s && prev) animate(0, CLOSE_MS, "in");
            }
            if (s) {
                cx = s.centerX;
                half = s.bodyWidth / 2;
                fullH = s.fullHeight;
                anchor = s.anchor;
                contentEl = s.contentEl;
            }

            openValue = sample();
            const height = fullH * openValue;
            const active = openValue > 0.004 && fullH > 0;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const need = active ? barBottom + fullH + 60 : barBottom + 4;
            const clearH = Math.max(need, lastClearH);
            ctx.clearRect(0, 0, screenW, clearH);
            lastClearH = need;

            if (active) {
                const geom = { centerX: cx, bodyWidth: half * 2, height, barBottom, screenWidth: screenW, anchor };
                const path = new Path2D(surfaceFillPath(geom));
                ctx.fillStyle = p.bg;
                ctx.fill(path);
                ctx.strokeStyle = p.borderColor;
                ctx.lineWidth = 1;
                ctx.stroke(path);

                if (contentEl) {
                    const vHidden = Math.max(0, fullH - height);
                    const r = Math.min(RADIUS, half, height / 2);
                    contentEl.style.height = `${fullH}px`;
                    contentEl.style.translate = `0px ${-vHidden}px`;
                    contentEl.style.clipPath = `inset(${vHidden}px 0px 0px 0px round 0 0 ${r}px ${r}px)`;
                }
            } else if (contentEl) {
                contentEl.style.clipPath = "inset(0 0 100% 0)";
            }

            return start >= 0 && now() - start < dur;
        };

        const tick = () => {
            const animating = draw();
            if (animating) raf = requestAnimationFrame(tick);
            else running = false;
        };

        function kick() {
            if (!running) {
                running = true;
                raf = requestAnimationFrame(tick);
            }
        }

        kickRef.current = kick;
        resize();
        window.addEventListener("resize", resize);
        kick();

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
        };
    }, []);

    useEffect(() => {
        kickRef.current?.();
    }, [barHeight, bg, borderColor, surface]);

    return (
        <canvas
            ref={canvasRef}
            style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
        />
    );
}
