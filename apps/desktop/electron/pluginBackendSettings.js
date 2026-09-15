function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createPluginSettings(initialValues, report) {
  let values = isPlainObject(initialValues) ? initialValues : {}
  const listeners = new Set()

  function notify(key, value) {
    for (const listener of [...listeners]) {
      try {
        listener(key, value)
      } catch (e) {
        report('settings listener threw: ' + (e && e.message))
      }
    }
  }

  return {
    api: {
      get(key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined
      },
      onChange(listener) {
        if (typeof listener !== 'function') return () => {}
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    apply(next) {
      if (!isPlainObject(next)) return
      const previous = values
      values = next
      for (const key of Object.keys(next)) {
        if (!Object.is(previous[key], next[key])) notify(key, next[key])
      }
    },
  }
}

module.exports = { createPluginSettings }
