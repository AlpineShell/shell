function planLayoutStaging(layout) {
  if (!Array.isArray(layout) || layout.length === 0) return []
  const primaryEntry = layout.find((entry) => entry.primary) || layout[0]
  const others = layout.filter((entry) => entry !== primaryEntry)
  return [primaryEntry, ...others].map((entry) => ({
    id: entry.id,
    x: Math.round(entry.x - primaryEntry.x),
    y: Math.round(entry.y - primaryEntry.y),
    orientation: entry.orientation,
    makePrimary: entry === primaryEntry,
  }))
}

module.exports = { planLayoutStaging }
