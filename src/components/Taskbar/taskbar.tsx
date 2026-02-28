import SystemTray from "./lib/systemTray";

export default function Taskbar() {
    return (
        <div className="flex justify-between m-3">
            <div></div>
            <SystemTray />
        </div>
    );
}