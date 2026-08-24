function singleFlight(task) {
  let pending = null
  function guarded() {
    if (pending) return pending
    pending = Promise.resolve(task()).then(
      (value) => {
        pending = null
        return value
      },
      (error) => {
        pending = null
        throw error
      }
    )
    return pending
  }
  guarded.isPending = () => pending !== null
  return guarded
}

module.exports = { singleFlight }
