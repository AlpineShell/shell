const CHIP_BASE_CLASS =
  'relative flex min-h-7 min-w-7 cursor-grab touch-none select-none items-center justify-center rounded-md px-1 outline-offset-[-1px] transition-[box-shadow,opacity,background-color] duration-150 focus-visible:z-20 focus-visible:outline-none'

function hoverClass(darkText: boolean): string {
  return darkText ? 'hover:bg-black/5' : 'hover:bg-white/10'
}

function focusRingClass(darkText: boolean): string {
  return darkText
    ? 'focus-visible:shadow-[0_0_0_2px_#000,0_0_0_4px_#fff]'
    : 'focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]'
}

function markedRingClass(darkText: boolean): string {
  return darkText ? 'z-20 shadow-[0_0_0_2px_#000,0_0_0_4px_#fff]' : 'z-20 shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]'
}

function grabbedClass(darkText: boolean): string {
  return darkText ? '-translate-y-px bg-black/10' : '-translate-y-px bg-white/15'
}

function sampleClass(darkText: boolean): string {
  return darkText ? 'outline-1 outline-dashed outline-black/35' : 'outline-1 outline-dashed outline-white/40'
}

function chipClass({ darkText, expanded, grabbed, lifted, sample }: RidgeChipProps): string {
  return [
    CHIP_BASE_CLASS,
    hoverClass(darkText),
    focusRingClass(darkText),
    expanded || grabbed ? markedRingClass(darkText) : '',
    grabbed ? grabbedClass(darkText) : '',
    sample ? sampleClass(darkText) : '',
    lifted ? 'opacity-30' : '',
  ].join(' ')
}

export default function RidgeChip(props: RidgeChipProps) {
  const { id, label, tabbable, expanded, grabbed, controls, describedBy, children, ref } = props
  return (
    <div role="listitem" className="flex">
      <button
        ref={ref}
        type="button"
        data-ridge-chip={id}
        data-grabbed={grabbed || undefined}
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        aria-roledescription="movable item"
        aria-expanded={expanded}
        aria-controls={controls}
        aria-describedby={describedBy}
        onClick={props.onClick}
        onKeyDown={props.onKeyDown}
        onKeyUp={props.onKeyUp}
        onPointerDown={props.onPointerDown}
        onFocus={props.onFocus}
        className={chipClass(props)}
      >
        <span aria-hidden className="pointer-events-none flex items-center">
          {children}
        </span>
      </button>
    </div>
  )
}
