function createSweepMemo(readValue) {
  let currentSweep = new Map()
  let previousSweep = new Map()

  function valueFor(hwnd) {
    if (currentSweep.has(hwnd)) return currentSweep.get(hwnd)
    const value = previousSweep.has(hwnd) ? previousSweep.get(hwnd) : readValue(hwnd)
    currentSweep.set(hwnd, value)
    return value
  }

  function finishSweep() {
    previousSweep = currentSweep
    currentSweep = new Map()
  }

  return { valueFor, finishSweep }
}

function createWindowImageCache(readImagePath, nameFromPath) {
  const imagesByWindow = new Map()

  function imageFor(hwnd, processId) {
    const known = imagesByWindow.get(hwnd)
    if (known && known.processId === processId) return known
    const exePath = readImagePath(processId)
    if (!exePath) {
      imagesByWindow.delete(hwnd)
      return null
    }
    const image = { processId, exePath, name: nameFromPath(exePath) }
    imagesByWindow.set(hwnd, image)
    return image
  }

  function retainOnly(liveHandles) {
    const live = new Set(liveHandles)
    for (const hwnd of [...imagesByWindow.keys()]) {
      if (!live.has(hwnd)) imagesByWindow.delete(hwnd)
    }
  }

  return { imageFor, retainOnly }
}

module.exports = { createSweepMemo, createWindowImageCache }
