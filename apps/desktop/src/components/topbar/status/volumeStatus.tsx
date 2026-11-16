import { useRef, useState } from "react";
import { useSprings } from "../../../hooks/useSprings";
import VolumeFace from "../faces/volumeFace";

const PILL_WIDTH = 72;
const TOPBAR_GAP = 4;
const FADE_SPAN = 12;

const unit = (value: number) => Math.min(1, Math.max(0, value));

function frameStyle(box: number) {
    return {
        width: `${box}px`,
        marginRight: `${-Math.max(0, TOPBAR_GAP - box)}px`,
        opacity: String(unit(box / FADE_SPAN)),
    };
}

function SpringingVolumePill({ volume, darkText, onGone }: VolumeStatusProps & { onGone: () => void }) {
    const frameRef = useRef<HTMLDivElement>(null);

    useSprings(
        [0],
        [volume.showing ? PILL_WIDTH : 0],
        ([width]) => {
            if (frameRef.current) Object.assign(frameRef.current.style, frameStyle(Math.max(0, Math.round(width))));
        },
        () => {
            if (!volume.showing) onGone();
        },
    );

    return (
        <div ref={frameRef} role="status" style={frameStyle(0)} className="pointer-events-none flex shrink-0 overflow-hidden rounded-full">
            <VolumeFace level={volume.level} darkText={darkText} />
        </div>
    );
}

export default function VolumeStatus({ volume, darkText }: VolumeStatusProps) {
    const [present, setPresent] = useState(false);

    if (volume.showing && !present) setPresent(true);
    if (!present && !volume.showing) return null;

    return <SpringingVolumePill volume={volume} darkText={darkText} onGone={() => setPresent(false)} />;
}
