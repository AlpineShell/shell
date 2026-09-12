export default function RidgeStrip({ surface, lanes, ref }: RidgeStripProps) {
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Ridge"
      className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-field px-1.5 py-1 ring-1 ring-line-strong"
      style={{ backgroundColor: surface.bg }}
    >
      {lanes.left}
      {lanes.center}
      {lanes.right}
    </div>
  )
}
