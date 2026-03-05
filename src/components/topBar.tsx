import Clock from "./clock";
import StatusIndicator from "./statusIndicator";

declare global {
    interface Window {
        topbar: { setIgnoreMouseEvents: (ignore: boolean) => void };
    }
}

export default function TopBar() {
    return (
        <div className="w-full flex justify-between items-center h-6 bg-[#3F3F3F]/20">
            <div></div>
            <div
                className="flex items-center gap-1"
                onMouseEnter={() => window.topbar.setIgnoreMouseEvents(false)}
                onMouseLeave={() => window.topbar.setIgnoreMouseEvents(true)}
            >
                <StatusIndicator />
                <Clock />
            </div>
        </div>
    );
}