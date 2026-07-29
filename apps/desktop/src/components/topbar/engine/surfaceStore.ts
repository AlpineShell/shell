import type { SurfaceAnchor } from "./surfaceShape";

export interface EngineSurface {
    id: number;
    centerX: number;
    bodyWidth: number;
    fullHeight: number;
    outline: boolean;
    anchor: SurfaceAnchor;
    contentEl: HTMLElement | null;
}

let current: EngineSurface | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

export function nextSurfaceId(): number {
    return nextId++;
}

export function setSurface(surface: EngineSurface | null): void {
    current = surface;
    listeners.forEach((l) => l());
}

export function clearSurface(id: number): void {
    if (current && current.id === id) {
        setSurface(null);
    }
}

export function getSurface(): EngineSurface | null {
    return current;
}

export function subscribeSurface(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
