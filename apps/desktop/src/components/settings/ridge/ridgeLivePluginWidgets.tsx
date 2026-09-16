import { createElement } from 'react'
import { ThemeProvider } from '../../themeContext'
import { useTopbarWidgets } from '../../../plugins/pluginRegistry'
import { topbarSurface } from '../../topbar/topbarSurface'
import RidgePluginBoundary from './ridgePluginBoundary'

function ignoreMenuChange() {}

export default function RidgeLivePluginWidgets({ slot, data, darkText }: RidgeLivePluginWidgetsProps) {
  const widgets = useTopbarWidgets(slot)
  const theme = { darkText, bg: topbarSurface(data.color).bg, onMenuOpenChange: ignoreMenuChange }
  return (
    <ThemeProvider value={theme}>
      <span className="flex items-center gap-1">
        {widgets.map((widget) => (
          <RidgePluginBoundary key={widget.id} id={widget.id}>
            <span className="flex h-6 items-center">{createElement(widget.component)}</span>
          </RidgePluginBoundary>
        ))}
      </span>
    </ThemeProvider>
  )
}
