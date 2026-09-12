export function resolveSelection(rowIds: string[], selectedId: string | null, lastIndex: number): ListSelection {
  const found = selectedId === null ? -1 : rowIds.indexOf(selectedId)
  if (found >= 0) return { id: rowIds[found], index: found }
  if (rowIds.length === 0) return { id: '', index: 0 }
  const index = Math.min(Math.max(lastIndex, 0), rowIds.length - 1)
  return { id: rowIds[index], index }
}

export function moveSelection(rowIds: string[], current: ListSelection, step: number): ListSelection {
  if (rowIds.length === 0) return current
  const index = Math.min(Math.max(current.index + step, 0), rowIds.length - 1)
  return { id: rowIds[index], index }
}
