import type { ReactNode } from "react";
import { Plus } from "lucide-react";

function desktopNumbers(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index);
}

function DesktopsFacePart({ label, className, onPress, children }: { label: string; className: string; onPress?: () => void; children: ReactNode }) {
    if (!onPress) return <span className={className}>{children}</span>;
    return (
        <button aria-label={label} onClick={onPress} className={`${className} cursor-pointer`}>
            {children}
        </button>
    );
}

export default function DesktopsFace({ desktops, darkText, onSelect, onAdd }: DesktopsFaceProps) {
    const text = darkText ? "text-black" : "text-white";
    const hover = darkText ? "hover:bg-black/10" : "hover:bg-white/10";
    const current = darkText ? "bg-black/15" : "bg-white/20";

    return (
        <div className={`flex items-center h-4.5 gap-0.5 text-[12px] leading-none ${text} transition-colors duration-300`}>
            {desktopNumbers(desktops.count).map((index) => (
                <DesktopsFacePart
                    key={index}
                    label={`Desktop ${index + 1}`}
                    onPress={onSelect && (() => onSelect(index))}
                    className={`flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full tabular-nums ${index === desktops.current ? current : hover}`}
                >
                    {index + 1}
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
