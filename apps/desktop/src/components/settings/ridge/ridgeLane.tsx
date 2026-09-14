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

function stripOutlineClass(moving: boolean, darkText: boolean): string {
  if (moving) return darkText ? 'outline-1 outline-dashed outline-black/25' : 'outline-1 outline-dashed outline-white/30'
  return darkText
    ? 'empty:outline-1 empty:outline-dashed empty:outline-black/25'
    : 'empty:outline-1 empty:outline-dashed empty:outline-white/30'
}

function outlineClass(mode: RidgeLayoutMode, state: RidgeLaneDropState, moving: boolean, darkText: boolean): string {
  return mode === 'strip' && state !== 'refuse' ? stripOutlineClass(moving, darkText) : ''
}

export default function RidgeLane({
  slot,
  label,
  mode,
  surface,
  dropState = 'idle',
  moving = false,
  children,
  ref,
}: RidgeLaneProps) {
  const stacked = mode === 'stacked'
  const outline = outlineClass(mode, dropState, moving, surface.darkText)
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
        className={`relative z-10 flex flex-wrap items-center gap-1 transition-colors ${SIDE_ALIGNMENT[slot]} ${MODE_CLASSES[mode]} ${outline} ${dropStateClass(dropState, surface.darkText)}`}
        style={stacked ? { backgroundColor: surface.bg } : undefined}
      >
        {children}
      </div>
    </div>
  )
}
