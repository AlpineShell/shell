import { describe, expect, it } from 'vitest'

const { PRIVILEGED_SCHEMES } = await import('./privilegedSchemes.js')

function privilegesOf(scheme) {
  return PRIVILEGED_SCHEMES.find((entry) => entry.scheme === scheme)?.privileges
}

describe('the privileged schemes', () => {
  it('lets the topbar and settings import plugin modules, which is a cross-origin CORS load from the app page', () => {
    expect(privilegesOf('alpine-plugin')).toMatchObject({ standard: true, supportFetchAPI: true, corsEnabled: true })
  })

  it('keeps wallpaper files out of reach of a cross-origin fetch while still drawing them as images', () => {
    expect(privilegesOf('alpine-wallpaper')).toMatchObject({ standard: true, supportFetchAPI: true })
    expect(privilegesOf('alpine-wallpaper').corsEnabled).toBeUndefined()
  })
})
