import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Clock from "./clock";
import StatusIndicator from "./status/statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "../themeContext";
import { RidgeBackdropProvider } from "./ridgeBackdrop";
import MediaStatus from "./status/mediaStatus";
import MicrophoneStatus from "./status/microphoneStatus";
import DesktopSwitcher from "./desktopSwitcher";
import SystemTray from "./systemTray";
import LauncherTrigger from "./launcherTrigger";
import LauncherPanel from "./launcher/launcherPanel";
import WindowSwitcherPanel from "./windowSwitcherPanel";
import DisplayModePanel from "./displayModePanel";
import SmartScreenPanel from "./smartScreenPanel";
import { warmRenderableEmojis } from "../../lib/emojiRenderable";
import { useTopbarColor } from "../../hooks/useTopbarColor";
import { useForegroundColor } from "../../hooks/useForegroundColor";
import { useTopbarLayout } from "../../hooks/useTopbarLayout";
import { useTopbarInteractiveZones } from "../../hooks/useTopbarInteractiveZones";
import { visibleTopbarSlotItems } from "./layout/topbarLayout";
import { topbarSurface } from "./topbarSurface";
import TopbarChrome from "./chrome/topbarChrome";
import { setBarHovered } from "./chrome/chromeStore";
import PluginSlot from "./pluginSlot";
import NoticeStrip from "./noticeStrip";
import NoticeStatus from "./noticeStatus";
import { loadTopbarPlugins } from "../../plugins/loadPlugins";

const noop = () => {};

const TOPBAR_ELEMENTS: Record<TopbarItemId, () => ReactNode> = {
    "system-menu": () => <SystemMenu />,
    "plugins-left": () => <PluginSlot slot="left" />,
    desktops: () => <DesktopSwitcher look="numbers" />,
    "desktop-lines": () => <DesktopSwitcher look="lines" />,
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

const markBarHovered = () => setBarHovered(true);
const markBarLeft = () => setBarHovered(false);

const OVERLAY_PANELS = (
    <>
        <NoticeStrip />
        <WindowSwitcherPanel />
        <DisplayModePanel />
        <SmartScreenPanel />
    </>
);

export default function TopBar() {
    const wallpaperColor = useTopbarColor();
    const fgColor = useForegroundColor();
    const layout = useTopbarLayout();
    const leftCluster = useRef<HTMLDivElement>(null);
    const centerCluster = useRef<HTMLDivElement>(null);
    const rightCluster = useRef<HTMLDivElement>(null);
    useTopbarInteractiveZones(leftCluster, centerCluster, rightCluster);
    const { bg, darkText, borderColor } = topbarSurface(fgColor || wallpaperColor);
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

    const theme = useMemo(() => ({ darkText, bg, onMenuOpenChange: noop }), [darkText, bg]);
    const leftSlot = useMemo(() => renderSlot(layout, "left"), [layout]);
    const centerSlot = useMemo(() => renderSlot(layout, "center"), [layout]);
    const rightSlot = useMemo(() => renderSlot(layout, "right"), [layout]);

    return (
        <ThemeProvider value={theme}>
            <RidgeBackdropProvider value={ridgeBackdrop}>
                <TopbarChrome barHeight={24} bg={bg} barBorderColor={borderColor} />
                <div
                    className="w-full flex justify-between items-center h-6 relative z-10 transition-colors duration-300"
                    style={{ backgroundColor: bg }}
                    onMouseEnter={markBarHovered}
                    onMouseLeave={markBarLeft}
                >
                    <span ref={setRidgeBackdrop} aria-hidden className="absolute inset-0 pointer-events-none" />
                    <div ref={leftCluster} className="flex items-center gap-1 relative z-1 self-stretch min-w-0">
                        {leftSlot}
                    </div>
                    <div ref={centerCluster} className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 flex items-center gap-1 z-1">
                        <NoticeStatus />
                        {centerSlot}
                    </div>
                    <div ref={rightCluster} className="flex items-center gap-1 mr-1 relative z-1 self-stretch">
                        {rightSlot}
                    </div>
                </div>
                {launcherOpen && <LauncherPanel mode={launcherMode} />}
                {OVERLAY_PANELS}
            </RidgeBackdropProvider>
        </ThemeProvider>
    );
}
