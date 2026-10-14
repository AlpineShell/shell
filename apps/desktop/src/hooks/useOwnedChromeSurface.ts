import { useState, useSyncExternalStore, type RefObject } from "react";
import { getChromeSurface, subscribeChromeSurface, type ChromeSurface } from "../components/topbar/chrome/chromeStore";

export function useOwnedChromeSurface(ref: RefObject<HTMLElement | null>) {
    const owned = useSyncExternalStore(subscribeChromeSurface, () => {
        const surface = getChromeSurface();
        const content = surface?.contentEl;
        return content && ref.current && content.contains(ref.current) ? surface : null;
    });
    const [lastOwned, setLastOwned] = useState<ChromeSurface | null>(owned);
    if (owned && owned !== lastOwned) setLastOwned(owned);
    return { open: owned !== null, surface: owned ?? lastOwned };
}
