import { Component, type ReactNode } from 'react'
import { reportPluginWidgetError, pluginIdOfWidget } from '../../plugins/reportPluginWidgetError'

interface PluginErrorBoundaryProps {
  id: string
  children: ReactNode
}

export default class PluginErrorBoundary extends Component<PluginErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[plugins] widget "${this.props.id}" crashed:`, error)
    reportPluginWidgetError(pluginIdOfWidget(this.props.id), error)
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
