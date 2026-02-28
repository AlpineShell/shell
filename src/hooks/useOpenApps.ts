import { useEffect, useState } from 'react'

export function useOpenApps() {
  const [apps, setApps] = useState<OpenApp[]>([])

  useEffect(() => {
    window.shell.windows.openApps().then(setApps)
    window.shell.windows.onOpenAppsChanged(setApps)
  }, [])

  return apps
}
