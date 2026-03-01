import Clock from "./clock";
import StatusIndicator from "./statusIndicator";

export default function TopBar() {
    return (
        <div className="w-full flex justify-between items-center h-6 bg-[#3F3F3F]/20">
            <div></div>
            <div className="flex items-center -mt-0.5 gap-1">
                <StatusIndicator />
                <Clock />
            </div>
        </div>
    );
}