const { html, usePluginData, useDarkText, PopupMenu } = window.alpine

const WARN_PCT = 70
const DANGER_PCT = 90
const BAR_WIDTH = 132
const BAR_HEIGHT = 8

function fillColor(pct, dark) {
  if (pct >= DANGER_PCT) return 'rgba(239,68,68,0.95)'
  if (pct >= WARN_PCT) return 'rgba(245,158,11,0.95)'
  return dark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'
}

function formatReset(ms) {
  if (!ms) return null
  const delta = ms - Date.now()
  if (delta <= 0) return 'resetting'
  const mins = Math.round(delta / 60000)
  if (mins < 60) return 'resets in ' + mins + 'm'
  const hours = Math.round(mins / 60)
  if (hours < 24) return 'resets in ' + hours + 'h'
  const days = Math.round(hours / 24)
  return 'resets in ' + days + 'd'
}

function LimitRow({ limit, dark }) {
  const base = dark ? '0,0,0' : '255,255,255'
  const ratio = Math.max(0, Math.min(1, limit.percent / 100))
  const reset = formatReset(limit.resetsAtMs)
  return html`
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '20px' }}>
        <span style=${{ fontSize: '12px', color: `rgba(${base},0.8)` }}>${limit.label}</span>
        <span style=${{ fontSize: '12px', fontWeight: 600, color: `rgba(${base},0.95)`, fontVariantNumeric: 'tabular-nums' }}>${Math.round(limit.percent) + '%'}</span>
      </div>
      <div style=${{ height: '5px', borderRadius: '999px', background: `rgba(${base},${dark ? 0.12 : 0.18})`, overflow: 'hidden' }}>
        <div style=${{ width: ratio * 100 + '%', height: '100%', borderRadius: '999px', background: fillColor(limit.percent, dark) }} />
      </div>
      ${reset && html`<span style=${{ fontSize: '10px', color: `rgba(${base},0.45)` }}>${reset}</span>`}
    </div>
  `
}

function UsagePanel({ usage, dark }) {
  const rows = usage.limits && usage.limits.length ? usage.limits : [
    { key: 'session', label: 'Session · 5h', percent: usage.sessionPercent, resetsAtMs: usage.sessionResetsAtMs },
  ]
  return html`
    <div style=${{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '200px' }}>
      ${rows.map((limit) => html`<${LimitRow} key=${limit.key || limit.label} limit=${limit} dark=${dark} />`)}
    </div>
  `
}

const SWEEP_WIDTH = 44
const SWEEP_KEYFRAMES =
  '@keyframes claude-usage-sweep{0%{transform:translateX(-' +
  (SWEEP_WIDTH + 4) +
  'px)}100%{transform:translateX(' +
  (BAR_WIDTH + 4) +
  'px)}}'

export default function UsageBar() {
  const dark = useDarkText()
  const usage = usePluginData('claude-usage', null)
  const base = dark ? '0,0,0' : '255,255,255'
  const loading = !usage || !usage.ok
  const pct = usage ? usage.sessionPercent : 0
  const ratio = Math.max(0, Math.min(1, pct / 100))

  const fill = loading
    ? html`
        <div
          style=${{
            width: SWEEP_WIDTH + 'px',
            height: '100%',
            borderRadius: '999px',
            background: `rgba(${base},${dark ? 0.4 : 0.5})`,
            animation: 'claude-usage-sweep 1.4s ease-in-out infinite',
          }}
        >
          <style>${SWEEP_KEYFRAMES}</style>
        </div>
      `
    : html`
        <div
          style=${{
            width: ratio * 100 + '%',
            height: '100%',
            borderRadius: '999px',
            background: fillColor(pct, dark),
            transition: 'width 400ms ease, background 300ms ease',
          }}
        />
      `

  const trigger = html`
    <div style=${{ display: 'flex', alignItems: 'center', padding: '0 8px 0 2px', height: '100%' }}>
      <div
        style=${{
          width: BAR_WIDTH + 'px',
          height: BAR_HEIGHT + 'px',
          borderRadius: '999px',
          background: `rgba(${base},${dark ? 0.15 : 0.2})`,
          overflow: 'hidden',
        }}
      >
        ${fill}
      </div>
    </div>
  `

  if (loading) return trigger
  return html`<${PopupMenu} trigger=${trigger}><${UsagePanel} usage=${usage} dark=${dark} /><//>`
}
