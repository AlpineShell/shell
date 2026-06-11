import { ChevronRight, LayoutGrid } from 'lucide-react'
import { useTrayIcons } from '../../hooks/useTrayIcons'
import { useTrayLayout } from '../../hooks/useTrayLayout'
import { useTrayDisplay } from '../../hooks/useTrayDisplay'
import { useTraySettings } from '../../hooks/useTraySettings'
import { composeTray } from '../topbar/tray/composeTray'

export default function TrayPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const icons = useTrayIcons()
  const { layout } = useTrayLayout()
  const { display, setShowOnAllMonitors } = useTrayDisplay()
  const { settings, setSettings } = useTraySettings()
  const { visible, overflow } = composeTray(icons, layout)

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">System Tray</h1>

      <Section title="General">
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Show system tray"
            description="Display running apps' tray icons in the top bar."
            checked={settings.enabled}
            onChange={(v) => setSettings({ enabled: v })}
          />
          {settings.enabled && (
            <ToggleRow
              label="Show overflow arrow"
              description="Show the chevron that holds hidden icons. When off, the arrow is hidden and hidden icons are managed only here."
              checked={settings.showOverflow}
              onChange={(v) => setSettings({ showOverflow: v })}
            />
          )}
        </div>
      </Section>

      {settings.enabled && (
        <>
          <Section title="Icons">
            <button
              onClick={() => onNavigate('personalization/tray/icons')}
              className="flex items-center gap-3 px-4 h-16 rounded-lg bg-neutral-900 border border-white/5 hover:bg-neutral-800/80 cursor-pointer transition-colors text-left"
            >
              <LayoutGrid size={18} className="text-white/60 shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[13px] text-white/90">Manage icons</span>
                <span className="text-xs text-white/50">Reorder, show and hide tray icons · {visible.length} shown, {overflow.length} hidden</span>
              </div>
              <ChevronRight size={16} className="text-white/40 shrink-0" />
            </button>
          </Section>

          <Section title="Monitors">
            <ToggleRow
              label="Show on all monitors"
              description="Mirror the tray on every display's top bar. When off, it appears only on your primary display."
              checked={display.showOnAllMonitors}
              onChange={setShowOnAllMonitors}
            />
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-white/50 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-white/50 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative rounded-full transition-colors cursor-pointer ${checked ? 'bg-white' : 'bg-white/15'}`}
        style={{ width: 36, height: 20 }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-all"
          style={{ width: 16, height: 16, left: checked ? 18 : 2, backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)' }}
        />
      </button>
    </div>
  )
}
