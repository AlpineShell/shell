import { useAudioPeak } from "../../../hooks/useAudioPeak";
import { useMediaSession } from "../../../hooks/useMediaSession";
import { useMediaVisualizer } from "../../../hooks/useMediaVisualizer";
import { useDarkText } from "../../themeContext";
import PopupMenu from "../shared/popupMenu";
import MediaFace from "../faces/mediaFace";
import MediaMenu from "./mediaMenu";

export default function MediaStatus() {
    const darkText = useDarkText();
    const media = useMediaSession();
    const showVisualizer = useMediaVisualizer();
    const showAppIcon = !showVisualizer && !!media.appIcon;
    const peak = useAudioPeak(!!media.title && media.playing && !showAppIcon);

    if (!media.title) return null;

    return (
        <PopupMenu
            onOpen={() => window.shell.media.session().then(media.update)}
            trigger={<MediaFace title={media.title} appIcon={showAppIcon ? media.appIcon : null} peak={peak} darkText={darkText} />}
        >
            <MediaMenu media={media} darkText={darkText} />
        </PopupMenu>
    );
}
