import { Component } from 'react'
import { reportPluginWidgetError } from '../../plugins/reportPluginWidgetError'

export default class PluginPageBoundary extends Component<PluginPageBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[settings] plugin page "${this.props.id}" crashed:`, error)
    reportPluginWidgetError(this.props.id, error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
