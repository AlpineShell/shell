function singleFlight(task) {
  let pending = null
  return function () {
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
}

module.exports = { singleFlight }
