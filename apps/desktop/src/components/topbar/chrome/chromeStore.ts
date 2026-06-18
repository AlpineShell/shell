import type { ChromeAnchor } from "./chromeShape";

export interface ChromeSurface {
    id: number;
    centerX: number;
    bodyWidth: number;
    fullHeight: number;
    outline: boolean;
    anchor: ChromeAnchor;
    contentEl: HTMLElement | null;
}

let current: ChromeSurface | null = null;
let currentToast: ChromeSurface | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

export function nextSurfaceId(): number {
    return nextId++;
}

export function setChromeSurface(surface: ChromeSurface | null): void {
    current = surface;
    listeners.forEach((l) => l());
}

export function setToastSurface(surface: ChromeSurface | null): void {
    currentToast = surface;
    listeners.forEach((l) => l());
}

export function getToastSurface(): ChromeSurface | null {
    return currentToast;
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
