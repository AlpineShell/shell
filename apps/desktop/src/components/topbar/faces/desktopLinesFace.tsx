import DesktopsFacePart from "./desktopsFacePart";
import { desktopIndexes } from "./desktopIndexes";

export default function DesktopLinesFace({ desktops, darkText, onSelect, onClose }: DesktopsFaceProps) {
    const line = darkText ? "bg-black" : "bg-white";

    return (
        <div className="flex items-center h-4.5 px-1">
            {desktopIndexes(desktops.count).map((index) => (
                <DesktopsFacePart
                    key={index}
                    label={`Desktop ${index + 1}`}
                    onPress={onSelect && (() => onSelect(index))}
                    onMiddlePress={onClose && (() => onClose(index))}
                    className="group flex items-center h-4.5 px-1"
                >
                    <span
                        data-current={index === desktops.current || undefined}
                        className={`block h-1.25 rounded-full ${line} transition-all duration-300 ${index === desktops.current ? "w-4.5 opacity-100" : "w-2.5 opacity-40 group-hover:opacity-70"}`}
                    />
                </DesktopsFacePart>
            ))}
        </div>
    );
}
