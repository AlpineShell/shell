import { useEffect, useState } from 'react'

export default function Clock() {
    const [now, setNow] = useState(new Date())

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(interval)
    }, [])

    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const date = now.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })

    return (
        <div className="flex flex-col font-medium text-[13px] gap-0.5 items-end bg-systemBg rounded-full py-2 px-5">
            <div className="leading-none">{time}</div>
            <div className="leading-none">{date}</div>
        </div>
    )
}
