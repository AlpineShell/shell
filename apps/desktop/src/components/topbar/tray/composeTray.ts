export function composeTray(icons: TrayIcon[], layout: TrayLayout) {
  const byId = new Map(icons.map((i) => [i.id, i]))
  const ordered: TrayIcon[] = []

  for (const id of layout.order) {
    const icon = byId.get(id)
    if (icon) {
      ordered.push(icon)
      byId.delete(id)
    }
  }
  for (const icon of icons) {
    if (byId.has(icon.id)) ordered.push(icon)
  }

  const hidden = new Set(layout.hidden)
  return {
    visible: ordered.filter((i) => !hidden.has(i.id)),
    overflow: ordered.filter((i) => hidden.has(i.id)),
  }
}
