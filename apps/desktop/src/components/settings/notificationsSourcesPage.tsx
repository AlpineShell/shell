import { useNotifications } from '../../hooks/useNotifications'

export default function NotificationsSourcesPage() {
  const { config, setConfig } = useNotifications()
  const sources = Object.entries(config.bySource)

  const toggle = (key: string, enabled: boolean) => {
    const existing = config.bySource[key] || { label: key, enabled: true }
    setConfig({ bySource: { [key]: { ...existing, enabled } } })
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Per-app notifications</h1>
      <section className="flex flex-col gap-4">
        <p className="text-xs text-white/50">
          Turn notifications on or off for each source Alpine has seen. Sources appear here after their first notification.
        </p>
        {sources.length === 0 ? (
          <div className="text-sm text-white/50">No sources yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {sources.map(([key, src]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="text-sm truncate">{src.label || key}</div>
                <Toggle checked={src.enabled !== false} onChange={(v) => toggle(key, v)} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`shrink-0 relative rounded-full cursor-pointer transition-colors ${checked ? 'bg-white' : 'bg-white/15'}`}
      style={{ width: 36, height: 20 }}
    >
      <span
        className="absolute top-0.5 rounded-full transition-all"
        style={{ width: 16, height: 16, left: checked ? 18 : 2, backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)' }}
      />
    </button>
  )
}
