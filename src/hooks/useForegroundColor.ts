import { useEffect, useRef, useState } from "react"

export function useForegroundColor() {
    const [color, setColor] = useState<TopBarColor | null>(null)
    const displayIdRef = useRef(
        Number(new URLSearchParams(window.location.search).get('displayId'))
    )

    useEffect(() => {
        const id = displayIdRef.current

        function handleData(data: ForegroundColorData | null) {
            if (data && data.displayId === id) {
                setColor({ r: data.r, g: data.g, b: data.b, darkText: data.darkText })
            } else {
                setColor(null)
            }
        }

        window.topbar.foregroundColor().then(handleData)
        window.topbar.onForegroundColorChanged(handleData)
    }, [])

    return color
}
