import { createElement } from 'react'
import { EmptyState, PageTitle } from '@alpine/ui'
import { ThemeProvider } from '../themeContext'
import { usePluginComponent } from '../../hooks/usePluginComponent'
import { usePluginSettingsPages } from '../../hooks/usePluginSettingsPages'
import { useTheme } from '../../hooks/useTheme'
import PageSpinner from './pageSpinner'
import PluginPageBoundary from './pluginPageBoundary'
import PluginSettingRows from './pluginSettingRows'

const LOADING_LABEL = 'Loading plugin settings'

const NO_SUCH_PAGE = 'This plugin has no settings.'

const PAGE_FAILED = "This plugin's page failed to load."

function ignoreMenuChange() {}

export default function PluginSettingsPage({ pluginId }: PluginSettingsPageProps) {
  const pages = usePluginSettingsPages()
  if (pages === null) return <PageSpinner label={LOADING_LABEL} />
  const page = pages.find((candidate) => candidate.pluginId === pluginId)
  if (!page) return <EmptyState variant="plain" title={NO_SUCH_PAGE} />

  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle variant="plain" title={page.label} />
      {page.settings.length > 0 && (
        <div className="flex flex-col gap-3">
          <PluginSettingRows pluginId={page.pluginId} settings={page.settings} />
        </div>
      )}
      {page.exportName !== null && page.enabled && <PluginPageComponent page={page} exportName={page.exportName} />}
    </div>
  )
}

function PluginPageNote() {
  return <p className="text-xs text-ink-quiet">{PAGE_FAILED}</p>
}

function PluginPageComponent({ page, exportName }: PluginPageComponentProps) {
  const load = usePluginComponent(page.pluginId, page.entry, exportName)
  const theme = useTheme()
  if (load.status === 'loading') return null
  if (load.status === 'missing') return <PluginPageNote />
  const surface = { darkText: theme.name === 'light', bg: theme.background, onMenuOpenChange: ignoreMenuChange }
  return (
    <ThemeProvider value={surface}>
      <PluginPageBoundary id={page.pluginId} fallback={<PluginPageNote />}>
        {createElement(load.component)}
      </PluginPageBoundary>
    </ThemeProvider>
  )
}
