function caretClass(darkText: boolean): string {
  return darkText ? 'bg-black shadow-[0_0_0_1px_#fff]' : 'bg-white shadow-[0_0_0_1px_#000]'
}

export default function RidgeDragLayer({ surface, ghost, ghostRef, caretRef }: RidgeDragLayerProps) {
  return (
    <div aria-hidden className="pointer-events-none">
      <div
        ref={ghostRef}
        hidden={ghost === null}
        data-ridge-ghost
        className="fixed top-0 left-0 z-50 flex min-h-7 items-center rounded-md px-1 shadow-float ring-1 ring-line-strong"
        style={{ backgroundColor: surface.bg }}
      >
        {ghost}
      </div>
      <div
        ref={caretRef}
        data-ridge-caret
        className={`fixed top-0 left-0 z-50 rounded-full opacity-0 ${caretClass(surface.darkText)}`}
      />
    </div>
  )
}
