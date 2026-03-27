import Clock from "./clock";
import StatusIndicator from "./status/statusIndicator";
import SystemMenu from "./systemMenu";
import { ThemeProvider } from "../themeContext";
import MediaStatus from "./status/mediaStatus";
import MicrophoneStatus from "./status/microphoneStatus";

export default function TopBar() {
    return (
        <ThemeProvider value={false}>
            <div
                className="w-full flex justify-between items-center h-6 bg-[#1F2020]"
            >
                <div className="flex items-center gap-1">
                    <SystemMenu />
                </div>
                <div className="flex items-center gap-1 mr-1">
                    <MediaStatus />
                    <MicrophoneStatus />
                    <StatusIndicator />
                    <Clock />
                </div>
            </div>
        </ThemeProvider>
    );
}
