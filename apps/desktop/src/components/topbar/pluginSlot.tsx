import { createElement } from 'react'
import { useTopbarWidgets } from '../../plugins/pluginRegistry'
import PluginErrorBoundary from './pluginErrorBoundary'

export default function PluginSlot({ slot }: { slot: TopbarSlot }) {
  const widgets = useTopbarWidgets(slot)
  if (widgets.length === 0) return null
  return (
    <>
      {widgets.map((widget) => (
        <PluginErrorBoundary key={widget.id} id={widget.id}>
          <div className="flex items-center h-full">{createElement(widget.component)}</div>
        </PluginErrorBoundary>
      ))}
    </>
  )
}
