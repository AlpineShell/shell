const RIDGE_HIGHLIGHT_RING = 'bg-fill-ghost ring-1 ring-line-strong'

export function ridgeHighlightRing(highlighted: boolean): string {
  return highlighted ? RIDGE_HIGHLIGHT_RING : ''
}
