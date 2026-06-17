import { useEffect, useRef } from "react";
import { surfaceFillPath, barBorderPath, RADIUS, type ChromeGeometry, type ChromeAnchor } from "./chromeShape";
import { getChromeSurface, subscribeChromeSurface, type ChromeSurface } from "./chromeStore";

const OPEN_MS = 460;
const CLOSE_MS = 300;
const MORPH_MS = 400;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInCubic = (t: number) => t * t * t;

interface ChromeCanvasProps {
    barHeight: number;
    bg: string;
    barBorderColor: string;
    hovered: boolean;
}

export default function ChromeCanvas({ barHeight, bg, barBorderColor, hovered }: ChromeCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const kickRef = useRef<(() => void) | undefined>(undefined);
    const propsRef = useRef({ barHeight, bg, barBorderColor, hovered });
    propsRef.current = { barHeight, bg, barBorderColor, hovered };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        let openValue = 0;
        let oFrom = 0;
        let oTo = 0;
        let oStart = -1;
        let oDur = OPEN_MS;
        let oEase: "out" | "in" = "out";
        let cx = 0;
        let halfBody = 0;
        let fullH = 0;
        let outline = false;
        let anchor: ChromeAnchor = "center";
        let lastClearH = 0;
        let morphFrom: { cx: number; halfBody: number; fullH: number } | null = null;
        let morphStart = -1;
        let contentEl: HTMLElement | null = null;
        let lastSurface: ChromeSurface | null = null;
        let running = false;
        let raf = 0;

        const now = () => performance.now();
        const sampleOpen = () => {
            if (oStart < 0) return oTo;
            const t = Math.min(1, (now() - oStart) / oDur);
            const eased = oEase === "out" ? easeOutExpo(t) : easeInCubic(t);
            return oFrom + (oTo - oFrom) * eased;
        };
        const animateOpen = (to: number, dur: number, ease: "out" | "in") => {
            oFrom = sampleOpen();
            oTo = to;
            oStart = now();
            oDur = dur;
            oEase = ease;
        };

        const syncSurface = () => {
            const surface = getChromeSurface();
            if (surface === lastSurface) return;
            const previous = lastSurface;
            lastSurface = surface;
            if (surface && !previous) {
                cx = surface.centerX;
                halfBody = surface.bodyWidth / 2;
                fullH = surface.fullHeight;
                outline = surface.outline;
                anchor = surface.anchor;
                contentEl = surface.contentEl;
                morphFrom = null;
                animateOpen(1, OPEN_MS, "out");
            } else if (surface && previous) {
                outline = surface.outline;
                anchor = surface.anchor;
                contentEl = surface.contentEl;
                morphFrom = { cx, halfBody, fullH };
                morphStart = now();
            } else if (!surface && previous) {
                morphFrom = null;
                animateOpen(0, CLOSE_MS, "in");
            }
            kick();
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

            const surface = getChromeSurface();
            if (surface && morphFrom) {
                const mt = Math.min(1, (now() - morphStart) / MORPH_MS);
                const me = easeOutExpo(mt);
                cx = morphFrom.cx + (surface.centerX - morphFrom.cx) * me;
                halfBody = morphFrom.halfBody + (surface.bodyWidth / 2 - morphFrom.halfBody) * me;
                fullH = morphFrom.fullH + (surface.fullHeight - morphFrom.fullH) * me;
                if (mt >= 1) morphFrom = null;
            } else if (surface) {
                cx = surface.centerX;
                halfBody = surface.bodyWidth / 2;
                fullH = surface.fullHeight;
            }

            openValue = sampleOpen();
            const height = fullH * openValue;
            const surfaceActive = openValue > 0.004;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const need = surfaceActive ? barBottom + fullH + 60 : barBottom + 4;
            const clearH = Math.max(need, lastClearH);
            ctx.clearRect(0, 0, screenW, clearH);
            lastClearH = need;

            const geom: ChromeGeometry = { centerX: cx, bodyWidth: halfBody * 2, height, barBottom, screenWidth: screenW, anchor };
            if (surfaceActive) {
                ctx.fillStyle = p.bg;
                ctx.fill(new Path2D(surfaceFillPath(geom)));
            }
            if (p.hovered || surfaceActive) {
                ctx.strokeStyle = p.barBorderColor;
                ctx.lineWidth = 1;
                ctx.stroke(new Path2D(barBorderPath(geom, surfaceActive, outline)));
            }

            if (contentEl) {
                const naturalH = surface ? surface.fullHeight : fullH;
                const topHidden = Math.max(0, naturalH - height);
                const bgLeft = cx - halfBody;
                const bgRight = cx + halfBody;
                const contentLeft = surface ? surface.centerX - surface.bodyWidth / 2 : bgLeft;
                const contentRight = surface ? surface.centerX + surface.bodyWidth / 2 : bgRight;
                const leftHidden = Math.max(0, bgLeft - contentLeft);
                const rightHidden = Math.max(0, contentRight - bgRight);
                const r = Math.min(RADIUS, halfBody, height / 2);
                contentEl.style.height = `${naturalH}px`;
                contentEl.style.translate = `0px ${-topHidden}px`;
                contentEl.style.clipPath = `inset(${topHidden}px ${rightHidden}px 0px ${leftHidden}px round 0 0 ${r}px ${r}px)`;
            }

            return surfaceActive || morphFrom !== null || (oStart >= 0 && now() - oStart < oDur);
        };

        const tick = () => {
            const animating = draw();
            if (animating) {
                raf = requestAnimationFrame(tick);
            } else {
                running = false;
            }
        };

        function kick() {
            if (!running) {
                running = true;
                raf = requestAnimationFrame(tick);
            }
        }

        kickRef.current = kick;
        resize();
        const unsubscribe = subscribeChromeSurface(syncSurface);
        window.addEventListener("resize", resize);
        kick();

        return () => {
            cancelAnimationFrame(raf);
            unsubscribe();
            window.removeEventListener("resize", resize);
        };
    }, []);

    useEffect(() => {
        kickRef.current?.();
    }, [barHeight, bg, barBorderColor, hovered]);

    return (
        <canvas
            ref={canvasRef}
            style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
        />
    );
}
