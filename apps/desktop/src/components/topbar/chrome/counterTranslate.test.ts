import { describe, it, expect } from 'vitest'
import { counterTranslate } from './counterTranslate'

describe('counterTranslate', () => {
  it('undoes the slide the chrome canvas puts on a surface', () => {
    expect(counterTranslate('0px -45.5px')).toBe('0px 45.5px')
  })

  it('undoes a horizontal offset too', () => {
    expect(counterTranslate('12px 8px')).toBe('-12px -8px')
  })

  it('reads a lone value as horizontal only', () => {
    expect(counterTranslate('10px')).toBe('-10px 0px')
  })

  it('stays put when nothing is translated', () => {
    expect(counterTranslate('')).toBe('0px 0px')
    expect(counterTranslate('none')).toBe('0px 0px')
    expect(counterTranslate('0px 0px')).toBe('0px 0px')
    expect(counterTranslate(undefined)).toBe('0px 0px')
  })
})
