import { useState, useEffect } from "react";

export default function Clock() {
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
        <div className="text-white text-[13px] flex hover:cursor-pointer rounded-full px-2 hover:bg-white/10 h-full items-center">
            {time} {date}
        </div>
    );
}