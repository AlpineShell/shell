import { ChevronDown } from "lucide-react";
import { TRAY_CARET_SLOT_CLASS, TRAY_CLUSTER_CLASS, TRAY_ICON_SLOT_CLASS } from "./faceClasses";

export function TrayIconGlyph({ src }: TrayIconGlyphProps) {
    return src ? <img src={src} alt="" className="w-3.5 h-3.5" draggable={false} /> : <div className="w-3 h-3 rounded-sm bg-white/20" />;
}

export function TrayCaretGlyph({ darkText }: TrayCaretGlyphProps) {
    return <ChevronDown size={12} color={darkText ? "black" : "white"} />;
}

export default function TrayFace({ icons, showCaret, darkText }: TrayFaceProps) {
    return (
        <div className={TRAY_CLUSTER_CLASS}>
            {icons.map((icon) => (
                <div key={icon.id} title={icon.tooltip} className={TRAY_ICON_SLOT_CLASS}>
                    <TrayIconGlyph src={icon.icon} />
                </div>
            ))}
            {showCaret && (
                <div className={TRAY_CARET_SLOT_CLASS}>
                    <TrayCaretGlyph darkText={darkText} />
                </div>
            )}
        </div>
    );
}
