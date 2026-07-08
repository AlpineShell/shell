const { h, useState, useEffect, useDarkText } = window.alpine

function Weather() {
  const dark = useDarkText()
  const [temp, setTemp] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      fetch('https://api.open-meteo.com/v1/forecast?latitude=47.37&longitude=8.54&current=temperature_2m')
        .then((res) => res.json())
        .then((data) => {
          if (alive) setTemp(Math.round(data.current.temperature_2m))
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 600000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return h(
    'span',
    { style: { fontSize: '12px', padding: '0 6px', color: dark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)' } },
    temp === null ? '—' : temp + '°C',
  )
}

window.alpine.register({ type: 'topbar-widget', id: 'com.alpine.weather', component: Weather, slot: 'right', order: 20 })
