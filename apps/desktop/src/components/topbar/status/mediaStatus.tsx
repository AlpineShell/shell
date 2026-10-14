import { useCallback } from "react";
import { useAudioPeak } from "../../../hooks/useAudioPeak";
import { useMediaSession } from "../../../hooks/useMediaSession";
import { useMediaTimeline } from "../../../hooks/useMediaTimeline";
import { useMediaVisualizer } from "../../../hooks/useMediaVisualizer";
import { useDarkText } from "../../themeContext";
import PopupMenu from "../shared/popupMenu";
import MediaFace from "../faces/mediaFace";
import MediaMenu from "./mediaMenu";

export default function MediaStatus() {
    const darkText = useDarkText();
    const media = useMediaSession();
    const timeline = useMediaTimeline();
    const seek = useCallback((positionMs: number) => window.shell.media.seek(positionMs).then((result) => result.success), []);
    const showVisualizer = useMediaVisualizer();
    const showAppIcon = !showVisualizer && !!media.appIcon;
    const peak = useAudioPeak(!!media.title && media.playing && !showAppIcon);

    if (!media.title) return null;

    return (
        <PopupMenu
            triggerBackground={false}
            onOpen={() => window.shell.media.session().then(media.update)}
            trigger={<MediaFace title={media.title} appIcon={showAppIcon ? media.appIcon : null} peak={peak} darkText={darkText} />}
        >
            <MediaMenu media={media} timeline={timeline} onSeek={seek} darkText={darkText} />
        </PopupMenu>
    );
}
