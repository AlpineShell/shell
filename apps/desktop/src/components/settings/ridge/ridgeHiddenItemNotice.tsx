import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { CirclePlus, X } from 'lucide-react'
import { topbarItemLabel } from '../../topbar/layout/topbarLayout'
import Button from '../../ui/button'
import Card from '../../ui/card'
import IconButton from '../../ui/iconButton'

export default function RidgeHiddenItemNotice({ item, onAdd, onClose }: RidgeHiddenItemNoticeProps) {
  const region = useRef<HTMLDivElement>(null)
  const title = topbarItemLabel(item)

  useLayoutEffect(() => {
    region.current?.scrollIntoView({ block: 'nearest' })
  }, [item])

  function closeOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onClose()
  }

  return (
    <div
      ref={region}
      role="region"
      aria-label={`${title} settings`}
      onKeyDown={closeOnEscape}
      className="w-full max-w-[22rem]"
    >
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{title}</h3>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="text-xs text-ink-quiet">{`${title} is hidden from Ridge. Add it back to change its settings.`}</p>
        <Button variant="outline" size="sm" icon={<CirclePlus size={14} />} onClick={onAdd} className="self-start">
          {`Add ${title} to Ridge`}
        </Button>
      </Card>
    </div>
  )
}
