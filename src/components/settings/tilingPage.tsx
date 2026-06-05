import { useTiling } from '../../hooks/useTiling'

export default function TilingPage() {
  const { config, setConfig } = useTiling()

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Window Tiling</h1>

      <Section title="General">
        <ToggleRow
          label="Enable window tiling"
          description="Arrange windows into layouts. When off, Windows behaves normally."
          checked={config.enabled}
          onChange={(v) => setConfig({ enabled: v })}
        />
      </Section>

      {config.enabled && (
        <>
          <Section title="Mode">
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setConfig({ mode: 'snap' })}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-14 rounded-lg border border-white/5 transition-colors cursor-pointer ${
                    config.mode === 'snap' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  <span className="text-sm">Snap zones</span>
                  <span className="text-xs text-white/50">Recommended</span>
                </button>
                <button
                  onClick={() => setConfig({ mode: 'dynamic' })}
                  className={`flex-1 flex items-center justify-center h-14 rounded-lg border border-white/5 transition-colors cursor-pointer ${
                    config.mode === 'dynamic' ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  <span className="text-sm">Auto-tile</span>
                </button>
              </div>
              <p className="text-xs text-white/50">
                {config.mode === 'snap'
                  ? 'Snap windows into halves and quarters with Win+Arrow; they stay where you put them.'
                  : 'Automatically arranges all windows; re-tiles as windows open and close. Experimental.'}
              </p>
            </div>
          </Section>

          {config.mode === 'snap' && (
            <Section title="Snapping">
              <div className="flex flex-col gap-3">
                <ToggleRow
                  label="Win+Arrow snapping"
                  description="Use Win+Left / Right / Up / Down to snap the focused window."
                  checked={config.hotkeys}
                  onChange={(v) => setConfig({ hotkeys: v })}
                />
                <ToggleRow
                  label="Drag to zone"
                  description="Drag a window to a screen edge or corner to snap it there. Dropping it on a snapped window swaps the two."
                  checked={config.dragToZone}
                  onChange={(v) => setConfig({ dragToZone: v })}
                />
              </div>
            </Section>
          )}

          {config.mode === 'dynamic' && (
            <Section title="Layout">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">Layout</div>
                <select
                  value={config.dynamicLayout}
                  onChange={(e) => setConfig({ dynamicLayout: e.target.value as TilingDynamicLayout })}
                  className="bg-neutral-900 border border-white/10 rounded text-sm px-2 h-8 cursor-pointer"
                >
                  <option value="bsp">Spiral (BSP)</option>
                  <option value="columns">Columns</option>
                  <option value="master-stack">Master + stack</option>
                </select>
              </div>
              <p className="text-xs text-white/50 mt-3">
                New windows tile into place instantly. Drag a tile onto another to swap their positions.
              </p>
            </Section>
          )}

          <Section title="Spacing">
            <div className="flex flex-col gap-3">
              <SliderRow
                label="Gap"
                min={0}
                max={32}
                value={config.gap}
                suffix="px"
                onChange={(v) => setConfig({ gap: v })}
              />
              <SliderRow
                label="Outer margin"
                min={0}
                max={48}
                value={config.margin}
                suffix="px"
                onChange={(v) => setConfig({ margin: v })}
              />
            </div>
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

function ToggleRow({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-white/50 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`shrink-0 relative rounded-full transition-colors ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${checked ? 'bg-white' : 'bg-white/15'}`}
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

function SliderRow({ label, min, max, value, suffix, onChange }: { label: string; min: number; max: number; value: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 text-sm">{label}</div>
      <div className="flex items-center gap-3 shrink-0">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="accent-white cursor-pointer"
        />
        <span className="text-xs text-white/50 w-10 text-right tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
    </div>
  )
}
