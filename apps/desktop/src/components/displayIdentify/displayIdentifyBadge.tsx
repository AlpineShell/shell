function badgeNumberFromLocation(): number | null {
  const number = Number(new URLSearchParams(window.location.search).get('number'))
  return Number.isInteger(number) && number >= 1 ? number : null
}

export default function DisplayIdentifyBadge() {
  const number = badgeNumberFromLocation()
  if (number === null) return null
  return (
    <div className="flex h-screen w-screen items-center justify-center rounded-[28px] bg-black/80 text-white">
      <span className="text-[88px] font-semibold leading-none tabular-nums">{number}</span>
    </div>
  )
}
