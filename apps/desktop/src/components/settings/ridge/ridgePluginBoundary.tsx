import { Component } from 'react'

export default class RidgePluginBoundary extends Component<RidgePluginBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[ridge] plugin widget "${this.props.id}" crashed:`, error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
