import { useState } from "react";

interface ControlSliderProps {
    Icon?: React.FC<{ color: string; size: number }>;
    iconSrc?: string;
    value: number;
    onChange: (value: number) => void;
    label?: string;
    ariaLabel?: string;
    onIconClick?: () => void;
    muted?: boolean;
    darkText: boolean;
}

export default function ControlSlider({ Icon, iconSrc, value, onChange, label, ariaLabel, onIconClick, muted, darkText }: ControlSliderProps) {
    const [dragging, setDragging] = useState(false);
    const color = darkText ? "black" : "white";
    const mutedColor = darkText ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
    return (
        <div className="flex flex-col gap-1">
            {label && <span className={`text-[11px] ${darkText ? "text-black/50" : "text-white/50"} ml-1 truncate`}>{label}</span>}
            <div className={`flex ${darkText ? "bg-black/5" : "bg-[#3F3F3F]/20"} p-3 rounded-md ${darkText ? "text-black" : "text-white"} items-center gap-3`}>
            <div className={`shrink-0 ${onIconClick ? 'cursor-pointer' : ''}`} onClick={onIconClick}>
                {iconSrc ? (
                    <img src={iconSrc} alt="" className="w-3.75 h-3.75" style={{ filter: darkText ? 'brightness(0)' : 'brightness(0) invert(1)' }} draggable={false} />
                ) : Icon ? (
                    <Icon color={muted ? mutedColor : color} size={15} />
                ) : null}
            </div>
            <input
                type="range"
                min={0}
                max={100}
                value={value}
                aria-label={ariaLabel ?? label}
                onPointerDown={() => setDragging(true)}
                onPointerUp={() => setDragging(false)}
                onLostPointerCapture={() => setDragging(false)}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`cc-slider w-full ${dragging ? 'dragging' : 'animate'} ${darkText ? 'cc-slider-light' : ''}`}
                style={{ '--slider-progress': `${value}%` } as React.CSSProperties}
            />
            </div>
        </div>
    )
}
