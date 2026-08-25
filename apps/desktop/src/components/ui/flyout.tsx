import { useContext, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { FlyoutHostContext } from './flyoutHost'
import IconButton from './iconButton'

export default function Flyout({ open, title, subtitle, onClose, children }: FlyoutProps) {
  const host = useContext(FlyoutHostContext)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!host) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      aria-hidden={!open}
      inert={!open}
      tabIndex={-1}
      className={`alpine-flyout absolute inset-y-0 right-0 flex w-80 max-w-full flex-col border-l border-line-hairline bg-surface-2 shadow-float outline-none ${
        open ? 'pointer-events-auto translate-x-0 ease-enter' : 'pointer-events-none translate-x-full ease-exit'
      }`}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line-hairline px-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-dense font-medium text-ink-primary">{title}</span>
          {subtitle && <span className="truncate text-xs text-ink-quiet">{subtitle}</span>}
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>
    </div>,
    host
  )
}
