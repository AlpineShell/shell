import Clock from "./clock";
import StatusIndicator from "./statusIndicator";

declare global {
    interface Window {
        topbar: { setIgnoreMouseEvents: (ignore: boolean) => void };
    }
}

function onEnter() { window.topbar.setIgnoreMouseEvents(false) }
function onLeave() { window.topbar.setIgnoreMouseEvents(true) }

export default function TopBar() {
    return (
        <div className="w-full flex justify-between items-center h-6 bg-[#3F3F3F]/20">
            <div></div>
            <div
                className="flex items-center -mt-0.5 gap-1"
                onMouseEnter={onEnter}
                onMouseLeave={onLeave}
            >
                <StatusIndicator />
                <Clock />
            </div>
        </div>
    );
}