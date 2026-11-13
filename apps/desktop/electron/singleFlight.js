function singleFlight(task) {
  let pending = null
  function guarded() {
    if (pending) return pending
    let resolveTask
    let rejectTask
    const flight = new Promise((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })
    pending = flight
    flight.then(
      () => {
        if (pending === flight) pending = null
      },
      () => {
        if (pending === flight) pending = null
      }
    )
    try {
      Promise.resolve(task()).then(resolveTask, rejectTask)
    } catch (error) {
      rejectTask(error)
    }
    return flight
  }
  guarded.isPending = () => pending !== null
  return guarded
}

module.exports = { singleFlight }
