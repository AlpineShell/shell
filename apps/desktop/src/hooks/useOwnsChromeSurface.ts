import { useSyncExternalStore, type RefObject } from "react";
import { getChromeSurface, subscribeChromeSurface } from "../components/topbar/chrome/chromeStore";

export function useOwnsChromeSurface(ref: RefObject<HTMLElement | null>) {
    return useSyncExternalStore(subscribeChromeSurface, () => {
        const content = getChromeSurface()?.contentEl;
        return !!content && !!ref.current && content.contains(ref.current);
    });
}
