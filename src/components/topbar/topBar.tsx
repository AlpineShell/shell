import { useState } from "react";
import Clock from "./clock";
import StatusIndicator from "./status/statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "../themeContext";
import MediaStatus from "./status/mediaStatus";
import MicrophoneStatus from "./status/microphoneStatus";
import { useTopbarColor } from "../../hooks/useTopbarColor";
import { useForegroundColor } from "../../hooks/useForegroundColor";

export default function TopBar() {
    const wallpaperColor = useTopbarColor();
    const fgColor = useForegroundColor();
    const color = fgColor || wallpaperColor;
    const bg = color ? `rgb(${color.r},${color.g},${color.b})` : "rgb(31,32,32)";
    const darkText = color?.darkText ?? false;
    const fullscreenWindow = fgColor !== null;
    const [hovered, setHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuGap, setMenuGap] = useState<{ left: number; right: number } | null>(null);
    const borderColor = darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
    const showBorder = fullscreenWindow && (hovered || menuOpen);

    function handleMenuChange(open: boolean, gap?: { left: number; right: number }) {
        setMenuOpen(open);
        setMenuGap(open && gap ? gap : null);
    }

    return (
        <ThemeProvider value={{ darkText, bg, fullscreenWindow, onMenuOpenChange: handleMenuChange }}>
            <div
                className="w-full flex justify-between items-center h-6 relative z-10 transition-colors duration-300"
                style={{ backgroundColor: bg }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {showBorder && (menuGap ? (
                    <>
                        <div style={{ position: "absolute", bottom: 0, left: 0, width: menuGap.left, height: 1, backgroundColor: borderColor }} />
                        <div style={{ position: "absolute", bottom: 0, left: menuGap.right, right: 0, height: 1, backgroundColor: borderColor }} />
                    </>
                ) : (
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, backgroundColor: borderColor }} />
                ))}
                <div className="flex items-center gap-1 relative z-1 self-stretch">
                    <SystemMenu />
                </div>
                <div className="flex items-center gap-1 mr-1 relative z-1 self-stretch">
                    <MicrophoneStatus />
                    <MediaStatus />
                    <StatusIndicator />
                    <Clock />
                </div>
            </div>
        </ThemeProvider>
    );
}
