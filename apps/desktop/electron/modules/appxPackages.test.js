import { describe, it, expect } from 'vitest'
import appxPackages from './appxPackages.js'

const { familyNameOfPackage } = appxPackages

describe('familyNameOfPackage', () => {
  it('joins the package name and publisher id', () => {
    expect(familyNameOfPackage('Microsoft.WindowsCalculator_11.2210.0.0_x64__8wekyb3d8bbwe'))
      .toBe('Microsoft.WindowsCalculator_8wekyb3d8bbwe')
  })

  it('handles a populated resource id segment', () => {
    expect(familyNameOfPackage('Clipchamp.Clipchamp_4.5.10920.0_x64_neutral_yxz26nhyzhsrt'))
      .toBe('Clipchamp.Clipchamp_yxz26nhyzhsrt')
  })

  it('rejects a name that is not a package full name', () => {
    expect(familyNameOfPackage('Microsoft.WindowsCalculator_8wekyb3d8bbwe')).toBeNull()
    expect(familyNameOfPackage('')).toBeNull()
    expect(familyNameOfPackage(null)).toBeNull()
  })
})
