import { Plus } from "lucide-react";
import DesktopsFacePart from "./desktopsFacePart";
import { desktopIndexes } from "./desktopIndexes";

export default function DesktopsFace({ desktops, darkText, onSelect, onClose, onAdd }: DesktopsFaceProps) {
    const text = darkText ? "text-black" : "text-white";
    const hover = darkText ? "hover:bg-black/10" : "hover:bg-white/10";
    const current = darkText ? "bg-black/15" : "bg-white/20";

    return (
        <div className={`flex items-center h-4.5 gap-0.5 text-[12px] ${text} transition-colors duration-300`}>
            {desktopIndexes(desktops.count).map((index) => (
                <DesktopsFacePart
                    key={index}
                    label={`Desktop ${index + 1}`}
                    onPress={onSelect && (() => onSelect(index))}
                    onMiddlePress={onClose && (() => onClose(index))}
                    className={`flex items-center justify-center w-4.5 h-4.5 rounded-full tabular-nums ${index === desktops.current ? current : hover}`}
                >
                    <span className="[text-box:trim-both_cap_alphabetic]">{index + 1}</span>
                </DesktopsFacePart>
            ))}
            <DesktopsFacePart
                label="New desktop"
                onPress={onAdd}
                className={`flex items-center justify-center w-4.5 h-4.5 rounded-full opacity-70 hover:opacity-100 ${hover}`}
            >
                <Plus size={11} />
            </DesktopsFacePart>
        </div>
    );
}
