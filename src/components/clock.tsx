import { useState, useEffect } from "react";
import { useTopBarDarkText } from "./topBarThemeContext";

export default function Clock() {
    const darkText = useTopBarDarkText();
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const time = `${hours}:${minutes}`;
    const date = `${months[now.getMonth()]} ${now.getDate()}`;

    return (
        <div className={`${darkText ? "text-black" : "text-white"} text-[12px] flex hover:cursor-pointer rounded-full px-2 ${darkText ? "hover:bg-black/10" : "hover:bg-white/10"} h-full items-center transition-colors duration-300`}>
            {time} {date}
        </div>
    );
}