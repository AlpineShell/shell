import { useEffect, useState } from "react"

const MY_DISPLAY_ID = Number(new URLSearchParams(window.location.search).get("displayId"))

export function useShellNotice(): ShellNotice | null {
  const [notice, setNotice] = useState<ShellNotice | null>(null)

  useEffect(() => {
    const accept = (next: ShellNotice | null) => {
      if (!next) return
      setNotice(next.displayId != null && next.displayId !== MY_DISPLAY_ID ? null : next)
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
