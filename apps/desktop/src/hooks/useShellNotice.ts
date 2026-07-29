import { useEffect, useState } from "react"

const MY_DISPLAY_ID = Number(new URLSearchParams(window.location.search).get("displayId"))

export function useShellNotice(): ShellNotice | null {
  const [notice, setNotice] = useState<ShellNotice | null>(null)

  useEffect(() => {
    const accept = (next: ShellNotice | null) => {
      if (!next) return
      if (next.displayId != null && next.displayId !== MY_DISPLAY_ID) return
      setNotice(next)
    }
    window.notice.current().then(accept)
    const stopShow = window.notice.onShow(accept)
    const stopHide = window.notice.onHide(() => setNotice(null))
    return () => {
      stopShow()
      stopHide()
    }
  }, [])

  return notice
}
