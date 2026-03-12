import { useEffect, useState } from "react";
import Clock from "./clock";
import StatusIndicator from "./statusIndicator";
import SystemMenu from "./systemMenu";

export default function TopBar() {
    const [bgColor, setBgColor] = useState("rgba(63, 63, 63, 1)");

    useEffect(() => {
        window.topbar.color().then((color) => {
            if (color) setBgColor(`rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
        });
        window.topbar.onColorChanged((color) => {
            setBgColor(`rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
        });
    }, []);

    return (
        <div
            className="w-full flex justify-between items-center h-6 transition-colors duration-300"
            style={{ backgroundColor: bgColor }}
        >
            <div className="flex items-center gap-1">
                <SystemMenu />
            </div>
            <div className="flex items-center gap-1">
                <StatusIndicator />
                <Clock />
            </div>
        </div>
    );
}