const SIDE_ALIGNMENT: Record<TopbarSlot, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
}

const MODE_CLASSES: Record<RidgeLayoutMode, string> = {
  strip: 'min-h-8 min-w-12 rounded-md',
  stacked: 'min-h-10 rounded-field px-1.5 py-1 ring-1 ring-line-strong',
}

const WRAPPER_CLASSES: Record<RidgeLayoutMode, string> = {
  strip: 'contents',
  stacked: 'flex flex-col gap-1',
}

function dropStateClass(state: RidgeLaneDropState, darkText: boolean): string {
  if (state === 'refuse') return 'cursor-not-allowed bg-danger/15 outline-1 outline-dashed outline-danger'
  if (state === 'accept') return darkText ? 'bg-black/10' : 'bg-white/10'
  return ''
}

export default function RidgeLane({ slot, label, mode, surface, dropState = 'idle', children, ref }: RidgeLaneProps) {
  const stacked = mode === 'stacked'
  return (
    <div className={WRAPPER_CLASSES[mode]}>
      {stacked && (
        <span aria-hidden className="text-eyebrow uppercase text-ink-faint">
          {label}
        </span>
      )}
      <div
        ref={ref}
        role="list"
        aria-label={`${label} side`}
        data-ridge-lane={slot}
        data-drop-state={dropState}
        className={`relative z-10 flex flex-wrap items-center gap-1 transition-colors ${SIDE_ALIGNMENT[slot]} ${MODE_CLASSES[mode]} ${dropStateClass(dropState, surface.darkText)}`}
        style={stacked ? { backgroundColor: surface.bg } : undefined}
      >
        {children}
      </div>
    </div>
  )
}
