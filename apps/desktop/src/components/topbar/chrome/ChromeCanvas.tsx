import { useEffect, useRef } from "react";
import { surfaceFillPath, barBorderPath, windowCoverageClipPath, RADIUS, type ChromeGeometry, type ChromeAnchor } from "./chromeShape";
import { getChromeSurface, getSurfaceBackdrop, subscribeChromeSurface, subscribeSurfaceBackdrops, type ChromeSurface } from "./chromeStore";
import { SURFACE_SPRING, createSpring, isSpringResting, snapSpring, stepSpring } from "./chromeSpring";

const SURFACE_ACTIVE_OPEN = 0.004;
const CENTERED_GROW_FROM = 0.45;
const PIXEL_PRECISION = 0.05;
const FRACTION_PRECISION = 0.001;

const unit = (value: number) => Math.min(1, Math.max(0, value));

interface ChromeCanvasProps {
    barHeight: number;
    bg: string;
    barBorderColor: string;
    hovered: boolean;
    windowCoverage: TopbarRegionBounds[];
}

export default function ChromeCanvas({ barHeight, bg, barBorderColor, hovered, windowCoverage }: ChromeCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const kickRef = useRef<(() => void) | undefined>(undefined);
    const kickIfCoverageShowsRef = useRef<(() => void) | undefined>(undefined);
    const propsRef = useRef({ barHeight, bg, barBorderColor, hovered, windowCoverage });
    propsRef.current = { barHeight, bg, barBorderColor, hovered, windowCoverage };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const open = createSpring(0, FRACTION_PRECISION);
        const reveal = createSpring(1, FRACTION_PRECISION);
        const cx = createSpring(0, PIXEL_PRECISION);
        const halfBody = createSpring(0, PIXEL_PRECISION);
        const fullH = createSpring(0, PIXEL_PRECISION);
        const springs = [open, reveal, cx, halfBody, fullH];
        const shapeSprings = [cx, halfBody, fullH];

        let anchor: ChromeAnchor = "center";
        let lastClearH = 0;
        let morphing = false;
        let handingOver = false;
        let lastStepAt = 0;
        let contentEl: HTMLElement | null = null;
        let contentBox: { left: number; right: number; height: number } | null = null;
        let lastSurface: ChromeSurface | null = null;
        let running = false;
        let raf = 0;
        let allocatedHeight = 0;

        const restingHeight = () => propsRef.current.barHeight + 4;
        const surfaceHeight = (fullHeight: number) => propsRef.current.barHeight + fullHeight + 60;

        const allocate = (heightCss: number) => {
            const deviceWidth = Math.round(window.innerWidth * dpr);
            const deviceHeight = Math.round(heightCss * dpr);
            let wiped = false;
            if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
                canvas.width = deviceWidth;
                canvas.height = deviceHeight;
                lastClearH = 0;
                wiped = true;
            }
            if (allocatedHeight !== heightCss) {
                allocatedHeight = heightCss;
                canvas.style.height = `${heightCss}px`;
            }
            return wiped;
        };

        const growFor = (fullHeight: number) => allocate(Math.max(allocatedHeight, surfaceHeight(fullHeight)));

        const advanceSprings = () => {
            const at = performance.now();
            const seconds = running ? (at - lastStepAt) / 1000 : 0;
            lastStepAt = at;
            if (seconds <= 0) return;
            for (const spring of springs) stepSpring(spring, SURFACE_SPRING, seconds);
            if (morphing && shapeSprings.every(isSpringResting)) {
                morphing = false;
                handingOver = false;
            }
        };

        const openSurface = (surface: ChromeSurface) => {
            const halfTarget = surface.bodyWidth / 2;
            if (open.value < SURFACE_ACTIVE_OPEN) {
                snapSpring(cx, surface.centerX);
                snapSpring(fullH, surface.fullHeight);
                snapSpring(halfBody, surface.anchor === "center" ? halfTarget * CENTERED_GROW_FROM : halfTarget);
            }
            cx.target = surface.centerX;
            fullH.target = surface.fullHeight;
            halfBody.target = halfTarget;
            snapSpring(reveal, 1);
            open.target = 1;
            morphing = false;
            handingOver = false;
        };

        const morphSurface = (surface: ChromeSurface, previous: ChromeSurface) => {
            cx.target = surface.centerX;
            halfBody.target = surface.bodyWidth / 2;
            fullH.target = surface.fullHeight;
            open.target = 1;
            morphing = true;
            if (surface.id === previous.id) return;
            handingOver = true;
            snapSpring(reveal, 0);
            reveal.target = 1;
        };

        const closeSurface = () => {
            open.target = 0;
            if (anchor === "center") halfBody.target *= CENTERED_GROW_FROM;
            morphing = false;
            handingOver = false;
        };

        const syncSurface = () => {
            const surface = getChromeSurface();
            if (surface === lastSurface) return;
            const previous = lastSurface;
            lastSurface = surface;
            if (surface) {
                anchor = surface.anchor;
                contentEl = surface.contentEl;
                contentBox = {
                    left: surface.centerX - surface.bodyWidth / 2,
                    right: surface.centerX + surface.bodyWidth / 2,
                    height: surface.fullHeight,
                };
                if (previous) morphSurface(surface, previous);
                else openSurface(surface);
            } else if (previous) {
                closeSurface();
            }
            if (surface && growFor(surface.fullHeight)) draw();
            kick();
        };

        const resize = () => {
            if (allocate(Math.max(allocatedHeight, restingHeight()))) draw();
            kick();
        };

        const draw = () => {
            advanceSprings();
            const p = propsRef.current;
            const screenW = window.innerWidth;
            const barBottom = p.barHeight;

            const openValue = Math.max(0, open.value);
            const centerX = cx.value;
            const half = Math.max(0, halfBody.value);
            const fullHeight = Math.max(0, fullH.value);
            const height = fullHeight * openValue;
            const surfaceActive = openValue > SURFACE_ACTIVE_OPEN;

            const need = surfaceActive ? surfaceHeight(Math.max(fullHeight, height)) : restingHeight();
            if (need > allocatedHeight) allocate(need);

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const clearH = Math.max(need, lastClearH);
            ctx.clearRect(0, 0, screenW, clearH);
            lastClearH = need;

            const geom: ChromeGeometry = { centerX, bodyWidth: half * 2, height, barBottom, screenWidth: screenW, anchor };
            if (surfaceActive) {
                ctx.fillStyle = p.bg;
                ctx.fill(new Path2D(surfaceFillPath(geom)));
            }
            if ((p.hovered || surfaceActive) && p.windowCoverage.length > 0) {
                ctx.save();
                ctx.clip(new Path2D(windowCoverageClipPath(p.windowCoverage)));
                ctx.strokeStyle = p.barBorderColor;
                ctx.lineWidth = 1;
                ctx.stroke(new Path2D(barBorderPath(geom, surfaceActive)));
                ctx.restore();
            }

            if (contentEl) {
                const bgLeft = centerX - half;
                const bgRight = centerX + half;
                const box = contentBox ?? { left: bgLeft, right: bgRight, height: fullHeight };
                const naturalH = box.height;
                const vHidden = Math.max(0, naturalH - height);
                const slide = morphing ? 0 : vHidden;
                const follow = handingOver ? centerX - (box.left + box.right) / 2 : 0;
                const leftHidden = Math.max(0, bgLeft - (box.left + follow));
                const rightHidden = Math.max(0, box.right + follow - bgRight);
                const r = Math.min(RADIUS, half, height / 2);
                contentEl.style.height = `${naturalH}px`;
                contentEl.style.translate = `${follow}px ${-slide}px`;
                contentEl.style.opacity = handingOver ? String(unit(reveal.value)) : "";
                contentEl.style.clipPath = `inset(${slide}px ${rightHidden}px ${vHidden - slide}px ${leftHidden}px round 0 0 ${r}px ${r}px)`;
            }

            const backdrop = getSurfaceBackdrop(contentEl);
            if (backdrop) {
                for (const layer of [backdrop.bar, backdrop.surface]) {
                    if (!layer) continue;
                    layer.style.setProperty("--chrome-left", `${centerX - half}px`);
                    layer.style.setProperty("--chrome-width", `${half * 2}px`);
                    layer.style.setProperty("--chrome-height", `${fullHeight}px`);
                    layer.style.setProperty("--chrome-bar", `${barBottom}px`);
                    layer.style.opacity = String(unit(openValue) * unit(reveal.value));
                }
                if (backdrop.bar) backdrop.bar.style.clipPath = `inset(0 0 calc(100% - ${barBottom}px) 0)`;
                if (backdrop.surface) {
                    const layerLeft = backdrop.surface.getBoundingClientRect().left;
                    backdrop.surface.style.clipPath = `path("${surfaceFillPath({ ...geom, centerX: centerX - layerLeft })}")`;
                }
            }

            return !springs.every(isSpringResting);
        };

        const tick = () => {
            const animating = draw();
            if (animating) {
                raf = requestAnimationFrame(tick);
                return;
            }
            running = false;
            if (!getChromeSurface() && allocatedHeight !== restingHeight()) {
                allocate(restingHeight());
                draw();
            }
        };

        function kick() {
            if (!running) {
                running = true;
                lastStepAt = performance.now();
                raf = requestAnimationFrame(tick);
            }
        }

        const coverageShows = () => propsRef.current.hovered || open.value > SURFACE_ACTIVE_OPEN;

        const kickIfCoverageShows = () => {
            if (coverageShows()) kick();
        };

        kickRef.current = kick;
        kickIfCoverageShowsRef.current = kickIfCoverageShows;
        resize();
        const unsubscribe = subscribeChromeSurface(syncSurface);
        const unsubscribeBackdrops = subscribeSurfaceBackdrops(kick);
        window.addEventListener("resize", resize);
        kick();

        return () => {
            cancelAnimationFrame(raf);
            unsubscribe();
            unsubscribeBackdrops();
            window.removeEventListener("resize", resize);
        };
    }, []);

    useEffect(() => {
        kickRef.current?.();
    }, [barHeight, bg, barBorderColor, hovered]);

    useEffect(() => {
        kickIfCoverageShowsRef.current?.();
    }, [windowCoverage]);

    return (
        <canvas
            ref={canvasRef}
            style={{ position: "fixed", top: 0, left: 0, width: "100%", pointerEvents: "none", zIndex: 0 }}
        />
    );
}
