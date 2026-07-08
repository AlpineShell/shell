const { h, usePluginData, useDarkText, PopupMenu } = window.alpine

const WARN_PCT = 70
const DANGER_PCT = 90
const BAR_WIDTH = 110
const BAR_HEIGHT = 6

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
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return 'resets in ' + h + 'h ' + (m ? m + 'm' : '')
}

function Row({ label, percent, reset, dark }) {
  const base = dark ? '0,0,0' : '255,255,255'
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '1px' } },
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', gap: '20px', fontSize: '12px' } },
      h('span', { style: { color: `rgba(${base},0.7)` } }, label),
      h(
        'span',
        { style: { color: `rgba(${base},0.95)`, fontVariantNumeric: 'tabular-nums', fontWeight: 600 } },
        Math.round(percent) + '%',
      ),
    ),
    reset && h('span', { style: { fontSize: '10px', color: `rgba(${base},0.45)` } }, reset),
  )
}

function UsagePanel({ usage, dark }) {
  const base = dark ? '0,0,0' : '255,255,255'
  const children = [
    h(Row, {
      key: 'session',
      label: 'Session',
      percent: usage.sessionPercent,
      reset: formatReset(usage.sessionResetsAtMs),
      dark,
    }),
    h('div', { key: 'div', style: { height: '1px', background: `rgba(${base},0.1)`, margin: '2px 0' } }),
    h(Row, {
      key: 'weekly',
      label: 'Weekly',
      percent: usage.weeklyPercent,
      reset: formatReset(usage.weeklyResetsAtMs),
      dark,
    }),
  ]
  if (usage.subscriptionType) {
    children.push(
      h(
        'div',
        { key: 'sub', style: { fontSize: '10px', color: `rgba(${base},0.4)`, marginTop: '3px' } },
        'Claude ' + usage.subscriptionType.replace(/^\w/, (c) => c.toUpperCase()),
      ),
    )
  }
  return h('div', { style: { padding: '8px 11px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' } }, children)
}

function UsageBar() {
  const dark = useDarkText()
  const usage = usePluginData('claude-usage', null)
  const base = dark ? '0,0,0' : '255,255,255'
  const pct = usage ? usage.sessionPercent : 0
  const ratio = Math.max(0, Math.min(1, pct / 100))

  const trigger = h(
    'div',
    { style: { display: 'flex', alignItems: 'center', padding: '0 8px', height: '100%' } },
    h(
      'div',
      {
        style: {
          width: BAR_WIDTH + 'px',
          height: BAR_HEIGHT + 'px',
          borderRadius: '999px',
          background: `rgba(${base},${dark ? 0.15 : 0.2})`,
          overflow: 'hidden',
        },
      },
      h('div', {
        style: {
          width: ratio * 100 + '%',
          height: '100%',
          borderRadius: '999px',
          background: fillColor(pct, dark),
          transition: 'width 400ms ease, background 300ms ease',
        },
      }),
    ),
  )

  if (!usage || !usage.ok) return trigger
  return h(PopupMenu, { trigger }, h(UsagePanel, { usage, dark }))
}

window.alpine.register({ type: 'topbar-widget', id: 'claude-code-usage', component: UsageBar, slot: 'left', order: 0 })
