import { Component } from 'react'
import { reportPluginWidgetError, pluginIdOfWidget } from '../../../plugins/reportPluginWidgetError'

export default class RidgePluginBoundary extends Component<RidgePluginBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[ridge] plugin widget "${this.props.id}" crashed:`, error)
    reportPluginWidgetError(pluginIdOfWidget(this.props.id), error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
