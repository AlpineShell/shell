import type { ChromeAnchor } from "./chromeShape";

export interface SurfaceBackdrop {
    bar: HTMLElement | null;
    surface: HTMLElement | null;
}

export interface ChromeSurface {
    id: number;
    centerX: number;
    bodyWidth: number;
    fullHeight: number;
    anchor: ChromeAnchor;
    contentEl: HTMLElement | null;
}

let current: ChromeSurface | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const backdrops = new Map<HTMLElement, SurfaceBackdrop>();
const backdropListeners = new Set<() => void>();

export function nextSurfaceId(): number {
    return nextId++;
}

export function setChromeSurface(surface: ChromeSurface | null): void {
    current = surface;
    listeners.forEach((l) => l());
}

export function clearChromeSurface(id: number): void {
    if (current && current.id === id) {
        setChromeSurface(null);
    }
}

export function getChromeSurface(): ChromeSurface | null {
    return current;
}

export function subscribeChromeSurface(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function setSurfaceBackdrop(contentEl: HTMLElement, backdrop: SurfaceBackdrop | null): void {
    if (backdrop) backdrops.set(contentEl, backdrop);
    else backdrops.delete(contentEl);
    backdropListeners.forEach((l) => l());
}

export function getSurfaceBackdrop(contentEl: HTMLElement | null): SurfaceBackdrop | null {
    return contentEl ? backdrops.get(contentEl) ?? null : null;
}

export function subscribeSurfaceBackdrops(listener: () => void): () => void {
    backdropListeners.add(listener);
    return () => {
        backdropListeners.delete(listener);
    };
}
