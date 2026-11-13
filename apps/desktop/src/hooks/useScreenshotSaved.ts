import { useEffect, useState } from "react";

const MY_DISPLAY_ID = Number(new URLSearchParams(window.location.search).get("displayId"));

export function useScreenshotSaved(): ScreenshotSavedSignal | null {
    const [latest, setLatest] = useState<ScreenshotSavedSignal | null>(null);

    useEffect(
        () =>
            window.screenshot.onSaved((saved) => {
                if (saved.displayId != null && saved.displayId !== MY_DISPLAY_ID) return;
                setLatest((previous) => ({ saved, sequence: (previous?.sequence ?? 0) + 1 }));
            }),
        [],
    );

    return latest;
}
