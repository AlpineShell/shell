import { Component, type ReactNode } from 'react'

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
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
