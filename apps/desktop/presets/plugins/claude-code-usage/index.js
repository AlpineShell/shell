const { h, usePluginData, useDarkText, PopupMenu } = window.alpine

const WARN_RATIO = 0.9

function formatTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

function formatCost(n) {
  return '$' + (n || 0).toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)
}

function formatReset(usage) {
  if (!usage || !usage.blockActive || !usage.blockEndMs) return 'idle'
  const ms = usage.blockEndMs - Date.now()
  if (ms <= 0) return 'resetting'
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return 'resets in ' + (h > 0 ? h + 'h ' : '') + m + 'm'
}

function shortModel(model) {
  const id = String(model || '').toLowerCase()
  if (id.includes('opus')) return 'Opus'
  if (id.includes('sonnet')) return 'Sonnet'
  if (id.includes('haiku')) return 'Haiku'
  return model || 'unknown'
}

function Row({ label, value, muted }) {
  const dark = useDarkText()
  const base = dark ? '0,0,0' : '255,255,255'
  return h(
    'div',
    { style: { display: 'flex', justifyContent: 'space-between', gap: '18px', fontSize: '11px' } },
    h('span', { style: { color: `rgba(${base},${muted ? 0.5 : 0.7})` } }, label),
    h('span', { style: { color: `rgba(${base},0.9)`, fontVariantNumeric: 'tabular-nums' } }, value),
  )
}

function UsagePanel({ usage }) {
  const dark = useDarkText()
  const base = dark ? '0,0,0' : '255,255,255'
  const rows = [
    h(
      'div',
      { key: 'hd', style: { fontSize: '11px', fontWeight: 600, color: `rgba(${base},0.85)`, marginBottom: '2px' } },
      'Claude Code usage',
    ),
    h(Row, { key: 'blk', label: 'Block ' + formatCost(usage.budgetUsd) + ' budget', value: formatCost(usage.blockCost) }),
    h(Row, { key: 'blkt', label: 'Block tokens', value: formatTokens(usage.blockTokens), muted: true }),
    h(Row, { key: 'reset', label: 'Window', value: formatReset(usage), muted: true }),
    h('div', { key: 'sp', style: { height: '4px' } }),
    h(Row, { key: 'day', label: 'Today', value: formatCost(usage.todayCost) }),
    h(Row, { key: 'dayt', label: 'Today tokens', value: formatTokens(usage.todayTokens), muted: true }),
  ]
  if (usage.models && usage.models.length) {
    rows.push(
      h('div', {
        key: 'div',
        style: { height: '1px', background: `rgba(${base},0.1)`, margin: '5px 0' },
      }),
    )
    for (const m of usage.models) {
      rows.push(h(Row, { key: 'm-' + m.model, label: shortModel(m.model), value: formatCost(m.cost), muted: true }))
    }
  }
  return h('div', { style: { padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '160px' } }, rows)
}

function UsageBar() {
  const dark = useDarkText()
  const usage = usePluginData('claude-usage', null)
  const base = dark ? '0,0,0' : '255,255,255'

  const cost = usage ? usage.blockCost : 0
  const budget = usage && usage.budgetUsd ? usage.budgetUsd : 25
  const ratio = Math.max(0, Math.min(1, cost / budget))
  const warn = ratio >= WARN_RATIO
  const fill = warn ? 'rgba(239,68,68,0.9)' : `rgba(${base},${dark ? 0.75 : 0.85})`

  const trigger = h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '0 6px', height: '100%' } },
    h(
      'div',
      {
        style: {
          width: '44px',
          height: '5px',
          borderRadius: '3px',
          background: `rgba(${base},0.15)`,
          overflow: 'hidden',
        },
      },
      h('div', {
        style: {
          width: ratio * 100 + '%',
          height: '100%',
          borderRadius: '3px',
          background: fill,
          transition: 'width 300ms ease',
        },
      }),
    ),
    h(
      'span',
      { style: { fontSize: '11px', color: `rgba(${base},0.8)`, fontVariantNumeric: 'tabular-nums' } },
      formatCost(cost),
    ),
  )

  if (!usage) return trigger
  return h(PopupMenu, { trigger }, h(UsagePanel, { usage }))
}

window.alpine.register({ type: 'topbar-widget', id: 'claude-code-usage', component: UsageBar, slot: 'left', order: 0 })
