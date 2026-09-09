import { useEffect, useState } from 'react'

export function useSettingsValue(entry: SettingsValueEntry) {
  const [value, setValue] = useState<SettingsValue>(entry.defaultValue)

  useEffect(() => {
    let alive = true
    const apply = (next: SettingsValue) => {
      if (alive) setValue(entry.validate ? entry.validate(next) : next)
    }
    entry.read().then(apply).catch(() => {})
    const unsubscribe = entry.subscribe?.(apply)
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [entry])

  const write = (next: SettingsValue) => {
    setValue(next)
    Promise.resolve(entry.write(next)).catch(() => {
      entry.read().then((current) => setValue(current)).catch(() => {})
    })
  }

  return { value, write }
}
