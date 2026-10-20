import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { CirclePlus } from 'lucide-react'
import { Button, Card, Row, Section } from '@alpine/ui'
import { topbarItemLabel } from '../../topbar/layout/topbarLayout'

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
    <div ref={region} role="region" aria-label={`${title} settings`} onKeyDown={closeOnEscape}>
      <Section variant="label" title={title}>
        <Card variant="group">
          <Row label={`${title} is hidden from Ridge.`} description="Add it back to change its settings.">
            <div className="flex items-center gap-2">
              <Button shape="square" variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
              <Button shape="square" size="sm" icon={<CirclePlus size={14} />} onClick={onAdd}>
                {`Add ${title} to Ridge`}
              </Button>
            </div>
          </Row>
        </Card>
      </Section>
    </div>
  )
}
