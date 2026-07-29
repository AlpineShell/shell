import { useEffect, useState } from "react";
import Clock from "./clock";
import StatusIndicator from "./status/statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "../themeContext";
import MediaStatus from "./status/mediaStatus";
import MicrophoneStatus from "./status/microphoneStatus";
import SystemTray from "./systemTray";
import LauncherTrigger from "./launcherTrigger";
import LauncherPanel from "./launcherPanel";
import AltTabPanel from "./altTabPanel";
import { warmRenderableEmojis } from "../../lib/emojiRenderable";
import { useTopbarColor } from "../../hooks/useTopbarColor";
import { useForegroundColor } from "../../hooks/useForegroundColor";
import TopbarEngine from "./engine/topbarEngine";
import PluginSlot from "./pluginSlot";
import NoticeStrip from "./noticeStrip";
import { loadTopbarPlugins } from "../../plugins/loadPlugins";

const noop = () => {};

export default function TopBar() {
    const wallpaperColor = useTopbarColor();
    const fgColor = useForegroundColor();
    const color = fgColor || wallpaperColor;
    const bg = color ? `rgb(${color.r},${color.g},${color.b})` : "rgb(31,32,32)";
    const darkText = color?.darkText ?? false;
    const fullscreenWindow = fgColor !== null;
    const [hovered, setHovered] = useState(false);
    const [launcherOpen, setLauncherOpen] = useState(false);
    const [launcherMode, setLauncherMode] = useState<string | undefined>(undefined);
    const borderColor = darkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";

    useEffect(() => {
        window.launcher.onShow((data) => { setLauncherMode(data?.mode); setLauncherOpen(true); });
        window.launcher.onHide(() => setLauncherOpen(false));
    }, []);

    useEffect(() => {
        loadTopbarPlugins();
        return window.plugins.onReload(() => loadTopbarPlugins());
    }, []);

    useEffect(() => warmRenderableEmojis(), []);

    return (
        <ThemeProvider value={{ darkText, bg, fullscreenWindow, onMenuOpenChange: noop }}>
            <TopbarEngine barHeight={24} bg={bg} barBorderColor={borderColor} hovered={hovered} />
            <div
                className="w-full flex justify-between items-center h-6 relative z-10 transition-colors duration-300"
                style={{ backgroundColor: bg }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                <div className="flex items-center gap-1 relative z-1 self-stretch">
                    <SystemMenu />
                    <PluginSlot slot="left" />
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 flex items-center z-1">
                    <LauncherTrigger />
                </div>
                <div className="flex items-center gap-1 mr-1 relative z-1 self-stretch">
                    <SystemTray />
                    <MediaStatus />
                    <MicrophoneStatus />
                    <StatusIndicator />
                    <PluginSlot slot="right" />
                    <Clock />
                </div>
            </div>
            {launcherOpen && <LauncherPanel mode={launcherMode} />}
            <NoticeStrip />
            <AltTabPanel />
        </ThemeProvider>
    );
}
