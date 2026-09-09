export function bandLabel(band: 'light' | 'moderate' | 'heavy'): string {
  return band === 'heavy' ? 'Heavy' : band === 'moderate' ? 'Moderate' : 'Light'
}

export function bandTone(band: 'light' | 'moderate' | 'heavy'): BadgeTone {
  return band === 'heavy' ? 'warning' : 'neutral'
}

export function processKey(target: string | null): string | null {
  if (!target) return null
  const base = target.split(/[\\/]/).pop() || ''
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}
