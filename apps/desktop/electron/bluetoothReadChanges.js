const { randomUUID } = require('crypto')

function createUnchangedReadFilter(newReadId = randomUUID) {
  let lastReadKey = null
  let lastReadId = null

  function answer(snapshot, knownReadId) {
    if (!snapshot) return { unchanged: false, readId: null, snapshot: null }
    const readKey = JSON.stringify(snapshot)
    if (readKey !== lastReadKey) {
      lastReadKey = readKey
      lastReadId = newReadId()
    }
    if (knownReadId === lastReadId) return { unchanged: true }
    return { unchanged: false, readId: lastReadId, snapshot }
  }

  return { answer }
}

module.exports = { createUnchangedReadFilter }
