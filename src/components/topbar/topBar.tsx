import { useEffect, useState } from "react";
import Clock from "./clock";
import StatusIndicator from "./status/statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "../themeContext";
import MediaStatus from "./status/mediaStatus";
import MicrophoneStatus from "./status/microphoneStatus";
import LauncherTrigger from "./launcherTrigger";
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
    const [launcherGap, setLauncherGap] = useState<{ left: number; right: number } | null>(null);
    const borderColor = darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
    const activeGap = menuGap || launcherGap;
    const showBorder = fullscreenWindow && (hovered || menuOpen || launcherGap !== null);

    function handleMenuChange(open: boolean, gap?: { left: number; right: number }) {
        setMenuOpen(open);
        setMenuGap(open && gap ? gap : null);
    }

    useEffect(() => {
        window.topbar.onLauncherGap((data) => {
            setLauncherGap(data.open && data.gap ? data.gap : null);
        });
    }, []);

    return (
        <ThemeProvider value={{ darkText, bg, fullscreenWindow, onMenuOpenChange: handleMenuChange }}>
            <div
                className="w-full flex justify-between items-center h-6 relative z-10 transition-colors duration-300"
                style={{ backgroundColor: bg }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {fullscreenWindow && (activeGap ? (
                    <>
                        <div style={{ position: "absolute", bottom: 0, left: 0, width: activeGap.left, height: 1, backgroundColor: borderColor, opacity: showBorder ? 1 : 0, transition: "opacity 150ms ease" }} />
                        <div style={{ position: "absolute", bottom: 0, left: activeGap.right, right: 0, height: 1, backgroundColor: borderColor, opacity: showBorder ? 1 : 0, transition: "opacity 150ms ease" }} />
                    </>
                ) : (
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, backgroundColor: borderColor, opacity: showBorder ? 1 : 0, transition: "opacity 150ms ease" }} />
                ))}
                <div className="flex items-center gap-1 relative z-1 self-stretch">
                    <SystemMenu />
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 flex items-center z-1">
                    <LauncherTrigger />
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
