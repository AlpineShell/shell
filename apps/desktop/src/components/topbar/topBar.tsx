import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Clock from "./clock";
import StatusIndicator from "./status/statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "../themeContext";
import { RidgeBackdropProvider } from "./ridgeBackdrop";
import MediaStatus from "./status/mediaStatus";
import MicrophoneStatus from "./status/microphoneStatus";
import SystemTray from "./systemTray";
import LauncherTrigger from "./launcherTrigger";
import LauncherPanel from "./launcher/launcherPanel";
import WindowSwitcherPanel from "./windowSwitcherPanel";
import DisplayModePanel from "./displayModePanel";
import { warmRenderableEmojis } from "../../lib/emojiRenderable";
import { useTopbarColor } from "../../hooks/useTopbarColor";
import { useForegroundColor } from "../../hooks/useForegroundColor";
import { useWindowCoverage } from "../../hooks/useWindowCoverage";
import { useTopbarLayout } from "../../hooks/useTopbarLayout";
import { useTopbarInteractiveZones } from "../../hooks/useTopbarInteractiveZones";
import { visibleTopbarSlotItems } from "./layout/topbarLayout";
import { topbarSurface } from "./topbarSurface";
import ChromeCanvas from "./chrome/ChromeCanvas";
import PluginSlot from "./pluginSlot";
import NoticeStrip from "./noticeStrip";
import NoticeStatus from "./noticeStatus";
import { loadTopbarPlugins } from "../../plugins/loadPlugins";

const noop = () => {};

const TOPBAR_ELEMENTS: Record<TopbarItemId, () => ReactNode> = {
    "system-menu": () => <SystemMenu />,
    "plugins-left": () => <PluginSlot slot="left" />,
    notice: () => <NoticeStatus />,
    launcher: () => <LauncherTrigger />,
    tray: () => <SystemTray />,
    media: () => <MediaStatus />,
    microphone: () => <MicrophoneStatus />,
    status: () => <StatusIndicator />,
    "plugins-right": () => <PluginSlot slot="right" />,
    clock: () => <Clock />,
};

const renderSlot = (layout: TopbarLayoutItem[], slot: TopbarSlot) =>
    visibleTopbarSlotItems(layout, slot).map((item) => (
        <Fragment key={item.id}>{TOPBAR_ELEMENTS[item.id]()}</Fragment>
    ));

export default function TopBar() {
    const wallpaperColor = useTopbarColor();
    const fgColor = useForegroundColor();
    const windowCoverage = useWindowCoverage();
    const layout = useTopbarLayout();
    const leftCluster = useRef<HTMLDivElement>(null);
    const centerCluster = useRef<HTMLDivElement>(null);
    const rightCluster = useRef<HTMLDivElement>(null);
    useTopbarInteractiveZones(leftCluster, centerCluster, rightCluster);
    const { bg, darkText, borderColor } = topbarSurface(fgColor || wallpaperColor);
    const [hovered, setHovered] = useState(false);
    const [launcherOpen, setLauncherOpen] = useState(false);
    const [launcherMode, setLauncherMode] = useState<string | undefined>(undefined);
    const [ridgeBackdrop, setRidgeBackdrop] = useState<HTMLSpanElement | null>(null);

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
        <ThemeProvider value={{ darkText, bg, onMenuOpenChange: noop }}>
            <RidgeBackdropProvider value={ridgeBackdrop}>
                <ChromeCanvas barHeight={24} bg={bg} barBorderColor={borderColor} hovered={hovered} windowCoverage={windowCoverage} />
                <div
                    className="w-full flex justify-between items-center h-6 relative z-10 transition-colors duration-300"
                    style={{ backgroundColor: bg }}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    <span ref={setRidgeBackdrop} aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none" />
                    <div ref={leftCluster} className="flex items-center gap-1 relative z-1 self-stretch min-w-0">
                        {renderSlot(layout, "left")}
                    </div>
                    <div ref={centerCluster} className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 flex items-center gap-1 z-1">
                        <NoticeStatus />
                        {renderSlot(layout, "center")}
                    </div>
                    <div ref={rightCluster} className="flex items-center gap-1 mr-1 relative z-1 self-stretch">
                        {renderSlot(layout, "right")}
                    </div>
                </div>
                {launcherOpen && <LauncherPanel mode={launcherMode} />}
                <NoticeStrip />
                <WindowSwitcherPanel />
                <DisplayModePanel />
            </RidgeBackdropProvider>
        </ThemeProvider>
    );
}
