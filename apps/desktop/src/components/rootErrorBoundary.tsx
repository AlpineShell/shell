import { Component, type ErrorInfo } from 'react'
import { parseRootReloadCount, planRootReload } from '../lib/rootReload'

const RELOAD_COUNT_KEY = 'alpine-root-reloads'
const STABLE_AFTER_MS = 60000

function readReloadCount(): number {
  try {
    return parseRootReloadCount(sessionStorage.getItem(RELOAD_COUNT_KEY))
  } catch {
    return 0
  }
}

function writeReloadCount(count: number): boolean {
  try {
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(count))
    return true
  } catch {
    return false
  }
}

function forgetReloadCount(): boolean {
  try {
    sessionStorage.removeItem(RELOAD_COUNT_KEY)
    return true
  } catch {
    return false
  }
}

function describeRenderError(error: unknown, info: ErrorInfo): string {
  const message = error instanceof Error ? error.stack ?? `${error.name}: ${error.message}` : String(error)
  return `${message}\n${info.componentStack ?? ''}`
}

export default class RootErrorBoundary extends Component<RootErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }
  stableTimer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidMount() {
    this.stableTimer = setTimeout(forgetReloadCount, STABLE_AFTER_MS)
  }

  componentWillUnmount() {
    this.clearStableTimer()
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[${this.props.view}] render error:`, error)
    this.clearStableTimer()
    window.shell?.reportRenderError?.(describeRenderError(error, info))
    this.props.onFailure?.()
    const previousReloads = readReloadCount()
    const plan = planRootReload(previousReloads)
    if (!plan.reload || !writeReloadCount(previousReloads + 1)) return
    setTimeout(() => window.location.reload(), plan.delayMs)
  }

  clearStableTimer() {
    if (this.stableTimer) clearTimeout(this.stableTimer)
    this.stableTimer = null
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
