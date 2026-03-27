import Clock from "./clock";
import StatusIndicator from "./status/statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "../themeContext";
import MediaStatus from "./status/mediaStatus";
import MicrophoneStatus from "./status/microphoneStatus";
import { useTopbarColor } from "../../hooks/useTopbarColor";

export default function TopBar() {
    const color = useTopbarColor();
    const bg = color ? `rgb(${color.r},${color.g},${color.b})` : "rgb(31,32,32)";
    const darkText = color?.darkText ?? false;

    return (
        <ThemeProvider value={{ darkText, bg }}>
            <div
                className="w-full flex justify-between items-center h-6 relative z-10 transition-colors duration-300"
                style={{ backgroundColor: bg }}
            >
                <div className="flex items-center gap-1">
                    <SystemMenu />
                </div>
                <div className="flex items-center gap-1 mr-1">
                    <MicrophoneStatus />
                    <MediaStatus />
                    <StatusIndicator />
                    <Clock />
                </div>
            </div>
        </ThemeProvider>
    );
}
