import { useEffect, useRef, useState } from "react"

export function useForegroundColor() {
    const [color, setColor] = useState<TopBarColor | null>(null)
    const displayIdRef = useRef(
        Number(new URLSearchParams(window.location.search).get('displayId'))
    )

    useEffect(() => {
        const id = displayIdRef.current

        function handleUpdate(data: ForegroundColorBroadcast) {
            if (data.displayId !== id) return
            if ('r' in data) {
                setColor({ r: data.r, g: data.g, b: data.b, darkText: data.darkText })
            } else {
                setColor(null)
            }
        }

        window.topbar.foregroundColor().then((list) => {
            const match = list.find((d) => d.displayId === id)
            if (match) {
                setColor({ r: match.r, g: match.g, b: match.b, darkText: match.darkText })
            }
        })
        window.topbar.onForegroundColorChanged(handleUpdate)
    }, [])

    return color
}
