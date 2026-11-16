const LEVEL_EASING = "cubic-bezier(0.34, 1.3, 0.64, 1)";
const SHOWN_TRANSITION = `width 320ms ${LEVEL_EASING}, opacity 120ms ease-out`;
const HIDDEN_TRANSITION = `width 320ms ${LEVEL_EASING}, opacity 500ms ease-in`;

export default function VolumeFill({ volume, darkText }: VolumeFillProps) {
    return (
        <span
            aria-hidden
            data-volume-fill
            className={`pointer-events-none absolute inset-y-0 left-0 -z-10 rounded-full ${darkText ? "bg-black/15" : "bg-white/30"}`}
            style={{
                width: `${Math.min(1, Math.max(0, volume.level)) * 100}%`,
                opacity: volume.showing ? 1 : 0,
                transition: volume.showing ? SHOWN_TRANSITION : HIDDEN_TRANSITION,
            }}
        />
    );
}
