const LEADER_LAYER: Record<RidgeLayoutMode, string> = {
  strip: 'z-20',
  stacked: 'z-0',
}

export default function RidgeCalloutFrame({ id, mode, children, ref, leaderRef }: RidgeCalloutFrameProps) {
  return (
    <>
      <svg
        aria-hidden
        className={`pointer-events-none absolute inset-0 h-full w-full overflow-visible text-ink-faint ${LEADER_LAYER[mode]}`}
      >
        <path ref={leaderRef} data-ridge-leader fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      <div className="relative z-10 w-full">
        <div ref={ref} id={id} className="w-88 max-w-full">
          {children}
        </div>
      </div>
    </>
  )
}
