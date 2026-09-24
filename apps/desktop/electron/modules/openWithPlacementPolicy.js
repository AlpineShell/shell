const OPEN_WITH_CLASS_NAME = 'Open With'
const OPEN_WITH_PROCESS_NAME = 'openwith'

function isOpenWithClass(className) {
  return className === OPEN_WITH_CLASS_NAME
}

function isOpenWithDialog({ className, processName }) {
  return isOpenWithClass(className) && String(processName || '').toLowerCase() === OPEN_WITH_PROCESS_NAME
}

function isInsideWorkArea(rect, workArea) {
  return rect.left >= workArea.left
    && rect.top >= workArea.top
    && rect.right <= workArea.right
    && rect.bottom <= workArea.bottom
}

function centeredInWorkArea(rect, workArea) {
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const x = Math.round(workArea.left + (workArea.right - workArea.left - width) / 2)
  const y = Math.round(workArea.top + (workArea.bottom - workArea.top - height) / 2)
  return { x: Math.max(workArea.left, x), y: Math.max(workArea.top, y) }
}

function planOpenWithPlacement({ rect, nearestWorkArea, cursorWorkArea }) {
  if (!rect || rect.right <= rect.left || rect.bottom <= rect.top) return null
  if (nearestWorkArea && isInsideWorkArea(rect, nearestWorkArea)) return null
  const target = cursorWorkArea || nearestWorkArea
  if (!target) return null
  const position = centeredInWorkArea(rect, target)
  if (position.x === rect.left && position.y === rect.top) return null
  return position
}

module.exports = {
  isOpenWithClass,
  isOpenWithDialog,
  isInsideWorkArea,
  centeredInWorkArea,
  planOpenWithPlacement,
}
