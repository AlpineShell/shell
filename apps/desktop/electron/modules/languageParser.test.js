import { describe, it, expect } from 'vitest'
import languageParser from './languageParser.js'

const {
  isValidLanguageTag,
  isValidKlid,
  isValidInputMethodTip,
  normalizeKlid,
  splitInputMethodTip,
  klidToLayoutWord,
  hklToKlid,
  hklToLangId,
  stripBidiMarks,
  parseSwitchHotkey,
  sanitizeLanguageTags,
  sanitizeInputMethodTips,
  parseLanguageState,
  parseCatalog,
  parseWriteResult,
  findInputMethodForLayout,
} = languageParser

const IME_TIP = '0411:{03b5835f-f03c-411b-9ce2-aa23e1171e36}{A76C93D9-5523-4E90-AAFA-4DB112F9AC76}'

const READ_OUTPUT = JSON.stringify({
  availability: 'ready',
  languages: [
    {
      tag: 'de-CH',
      langId: '0807',
      autonym: 'Deutsch (Schweiz)',
      englishName: 'German',
      localizedName: 'Deutsch (Schweiz)',
      script: 'Lateinisch',
      inputMethodTips: ['0807:00000807'],
    },
    {
      tag: 'en-CH',
      langId: '2000',
      autonym: 'English (Switzerland)',
      englishName: 'English',
      localizedName: 'Englisch (Schweiz)',
      script: 'Lateinisch',
      inputMethodTips: [],
    },
    {
      tag: 'en-GB',
      langId: '0809',
      autonym: 'English (United Kingdom)',
      englishName: 'English',
      localizedName: 'Englisch (Vereinigtes Koenigreich)',
      script: 'Lateinisch',
      inputMethodTips: ['0809:00000807', '0809:00000407'],
    },
  ],
  displayLanguageOverride: null,
  effectiveDisplayLanguage: 'de-DE',
  installedDisplayLanguages: ['de-DE', 'en-GB', 'en-US'],
  defaultInputMethod: '0807:00000807',
  regionalFormat: { tag: 'de-CH', englishName: 'German (Switzerland)', nativeName: 'Deutsch (Schweiz)' },
  systemLocale: { tag: 'en-GB', englishName: 'English (United Kingdom)' },
  homeLocation: { geoId: 223, name: 'Schweiz' },
  keyboardCatalog: {
    '00000807': { text: 'Swiss German', display: '@C:\\Windows\\system32\\input.dll,-5024' },
    '00000407': { text: 'German', display: '@C:\\Windows\\system32\\input.dll,-5011' },
  },
  imeCatalog: {},
  switchHotkey: { hotkey: '', languageHotkey: '', layoutHotkey: '' },
})

const MUI_NAMES = {
  '@C:\\Windows\\system32\\input.dll,-5024': 'Deutsch (Schweiz)',
  '@C:\\Windows\\system32\\input.dll,-5011': 'Deutsch',
}

function resolveMui(indirect, fallback) {
  return MUI_NAMES[indirect] ?? fallback
}

function failingResolver(_indirect, fallback) {
  return fallback
}

describe('isValidLanguageTag', () => {
  it('accepts well-formed BCP-47 tags', () => {
    expect(isValidLanguageTag('de-CH')).toBe(true)
    expect(isValidLanguageTag('zh-Hans-CN')).toBe(true)
    expect(isValidLanguageTag('en')).toBe(true)
  })

  it('rejects values that could be mistaken for a PowerShell parameter', () => {
    expect(isValidLanguageTag('-Command')).toBe(false)
    expect(isValidLanguageTag("de'; Remove-Item")).toBe(false)
    expect(isValidLanguageTag('de-CH,en-GB')).toBe(false)
    expect(isValidLanguageTag('x'.repeat(200))).toBe(false)
    expect(isValidLanguageTag(null)).toBe(false)
  })
})

describe('isValidKlid', () => {
  it('accepts eight hex digits including synthetic ids', () => {
    expect(isValidKlid('00000807')).toBe(true)
    expect(isValidKlid('d0010809')).toBe(true)
    expect(isValidKlid('00000C51')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isValidKlid('ZZZZZZZZ')).toBe(false)
    expect(isValidKlid('0000080')).toBe(false)
    expect(isValidKlid(undefined)).toBe(false)
  })
})

describe('isValidInputMethodTip', () => {
  it('accepts keyboard layout tips and IME tips', () => {
    expect(isValidInputMethodTip('0807:00000807')).toBe(true)
    expect(isValidInputMethodTip(IME_TIP)).toBe(true)
  })

  it('rejects malformed tips', () => {
    expect(isValidInputMethodTip('0409:0000040')).toBe(false)
    expect(isValidInputMethodTip('00000807')).toBe(false)
    expect(isValidInputMethodTip('0809:00000807,0809:00000407')).toBe(false)
  })
})

describe('splitInputMethodTip', () => {
  it('splits a layout tip into a lowercase language id and klid', () => {
    expect(splitInputMethodTip('100C:0000100C')).toEqual({ langId: '100c', kind: 'layout', klid: '0000100c' })
  })

  it('marks a GUID pair as an IME and carries no klid', () => {
    expect(splitInputMethodTip(IME_TIP)).toEqual({ langId: '0411', kind: 'ime', klid: null })
  })

  it('returns null for a malformed tip', () => {
    expect(splitInputMethodTip('0409:0000040')).toBe(null)
  })
})

describe('normalizeKlid', () => {
  it('lowercases so an uppercase tip matches a lowercase registry key', () => {
    expect(normalizeKlid('0000100C')).toBe('0000100c')
    expect(normalizeKlid('')).toBe(null)
  })
})

describe('klidToLayoutWord', () => {
  it('derives the HKL high word for a plain klid', () => {
    expect(klidToLayoutWord('00000807')).toBe(0x0807)
    expect(klidToLayoutWord('0000100C')).toBe(0x100c)
  })

  it('refuses to guess for a klid with a non-zero prefix', () => {
    expect(klidToLayoutWord('00010409')).toBe(null)
    expect(klidToLayoutWord('d0010809')).toBe(null)
    expect(klidToLayoutWord('nope')).toBe(null)
  })
})

describe('hklToKlid', () => {
  it('takes the layout from the high word', () => {
    expect(hklToKlid(0x08070807)).toBe('00000807')
    expect(hklToKlid(0x04070809)).toBe('00000407')
  })

  it('falls back to the language id when the high word is zero', () => {
    expect(hklToKlid(0x00000409)).toBe('00000409')
  })

  it('returns null for the unverified 0xF000 layout-id encoding', () => {
    expect(hklToKlid(0xf0020409)).toBe(null)
  })
})

describe('hklToLangId', () => {
  it('takes the language from the low word', () => {
    expect(hklToLangId(0x08070809)).toBe('0809')
    expect(hklToLangId(0x08070807)).toBe('0807')
  })
})

describe('stripBidiMarks', () => {
  it('removes directional marks but keeps the rest of the autonym', () => {
    const arabic = String.fromCharCode(0x0627, 0x0644, 0x200f)
    expect(stripBidiMarks(arabic)).toBe(String.fromCharCode(0x0627, 0x0644))
  })

  it('returns an empty string for a non-string', () => {
    expect(stripBidiMarks(null)).toBe('')
  })
})

describe('parseSwitchHotkey', () => {
  it('treats an absent toggle key as the Windows default', () => {
    expect(parseSwitchHotkey({})).toEqual({ language: 'default', layout: 'default' })
    expect(parseSwitchHotkey(null)).toEqual({ language: 'default', layout: 'default' })
  })

  it('maps the documented registry values', () => {
    expect(parseSwitchHotkey({ languageHotkey: '2', layoutHotkey: '3' })).toEqual({ language: 'ctrl-shift', layout: 'grave' })
    expect(parseSwitchHotkey({ languageHotkey: '4' }).language).toBe('none')
  })

  it('falls back to the combined legacy value', () => {
    expect(parseSwitchHotkey({ hotkey: '1' })).toEqual({ language: 'alt-shift', layout: 'alt-shift' })
  })

  it('never throws on an unknown value', () => {
    expect(parseSwitchHotkey({ languageHotkey: '9' }).language).toBe('default')
  })
})

describe('sanitizeLanguageTags', () => {
  it('drops invalid entries and dedupes case-insensitively in first-seen order', () => {
    expect(sanitizeLanguageTags(['de-CH', 'DE-ch', '', 'x'.repeat(200), 'fr-CH'])).toEqual(['de-CH', 'fr-CH'])
  })

  it('drops tags that are not in the known set when one is supplied', () => {
    expect(sanitizeLanguageTags(['de-CH', 'fr-CH'], ['de-ch'])).toEqual(['de-CH'])
  })

  it('returns an empty array for a non-array', () => {
    expect(sanitizeLanguageTags('de-CH')).toEqual([])
  })
})

describe('sanitizeInputMethodTips', () => {
  it('keeps valid tips in order and drops duplicates', () => {
    expect(sanitizeInputMethodTips(['0809:00000807', '0809:00000807', 'nope', IME_TIP])).toEqual(['0809:00000807', IME_TIP])
  })
})

describe('parseLanguageState', () => {
  it('reports an error and stays usable when the script produced nothing', () => {
    const state = parseLanguageState('', resolveMui)
    expect(state.availability).toBe('error')
    expect(state.languages).toEqual([])
    expect(state.installedDisplayLanguages).toEqual([])
  })

  it('reports a missing International module distinctly', () => {
    expect(parseLanguageState('{"availability":"module-missing"}', resolveMui).availability).toBe('module-missing')
  })

  it('parses the three configured languages', () => {
    const state = parseLanguageState(READ_OUTPUT, resolveMui)
    expect(state.availability).toBe('ready')
    expect(state.languages.map((language) => language.tag)).toEqual(['de-CH', 'en-CH', 'en-GB'])
  })

  it('accepts a language with no input methods', () => {
    const state = parseLanguageState(READ_OUTPUT, resolveMui)
    expect(state.languages[1].inputMethods).toEqual([])
  })

  it('keeps the stored tip order rather than the preload slot order', () => {
    const state = parseLanguageState(READ_OUTPUT, resolveMui)
    expect(state.languages[2].inputMethods.map((method) => method.tip)).toEqual(['0809:00000807', '0809:00000407'])
  })

  it('resolves layout names through the MUI resolver', () => {
    const state = parseLanguageState(READ_OUTPUT, resolveMui)
    expect(state.languages[0].inputMethods[0].name).toBe('Deutsch (Schweiz)')
  })

  it('falls back to the English layout text when the MUI resource cannot be loaded', () => {
    const state = parseLanguageState(READ_OUTPUT, failingResolver)
    expect(state.languages[0].inputMethods[0].name).toBe('Swiss German')
  })

  it('does not treat a null display-language override as English', () => {
    const state = parseLanguageState(READ_OUTPUT, resolveMui)
    expect(state.displayLanguageOverride).toBe(null)
    expect(state.effectiveDisplayLanguage).toBe('de-DE')
  })

  it('carries the regional format, system locale and home location through', () => {
    const state = parseLanguageState(READ_OUTPUT, resolveMui)
    expect(state.regionalFormat.tag).toBe('de-CH')
    expect(state.systemLocale.tag).toBe('en-GB')
    expect(state.homeLocation).toEqual({ geoId: 223, name: 'Schweiz' })
  })

  it('labels an IME tip as an IME and gives it no klid', () => {
    const raw = JSON.stringify({
      availability: 'ready',
      languages: [{ tag: 'ja-JP', langId: '0411', autonym: 'Japanese', inputMethodTips: [IME_TIP] }],
      keyboardCatalog: {},
      imeCatalog: { [IME_TIP]: { text: 'Microsoft IME', display: '@C:\\Windows\\system32\\input.dll,-5183' } },
    })
    const method = parseLanguageState(raw, failingResolver).languages[0].inputMethods[0]
    expect(method.kind).toBe('ime')
    expect(method.klid).toBe(null)
    expect(method.name).toBe('Microsoft IME')
  })
})

describe('parseCatalog', () => {
  it('returns empty lists when the script produced nothing', () => {
    expect(parseCatalog('', resolveMui)).toEqual({ languages: [], layouts: [], regions: [] })
  })

  it('lowercases klids and resolves layout names', () => {
    const raw = JSON.stringify({
      languages: [{ tag: 'fr-CH', autonym: 'Francais (Suisse)', englishName: 'French (Switzerland)', defaultTips: ['100C:0000100C'] }],
      layouts: [{ klid: '00000807', text: 'Swiss German', display: '@C:\\Windows\\system32\\input.dll,-5024' }],
      regions: [{ geoId: 223, iso: 'CH', englishName: 'Switzerland', displayName: 'Schweiz' }],
    })
    const catalog = parseCatalog(raw, resolveMui)
    expect(catalog.layouts).toEqual([{ klid: '00000807', name: 'Deutsch (Schweiz)' }])
    expect(catalog.languages[0].defaultTips).toEqual(['100C:0000100C'])
    expect(catalog.regions[0].geoId).toBe(223)
  })

  it('drops rows with an invalid tag or klid', () => {
    const raw = JSON.stringify({
      languages: [{ tag: '-Command', autonym: 'bad' }],
      layouts: [{ klid: 'nope', text: 'bad' }],
      regions: [{ geoId: 0, englishName: 'bad' }],
    })
    expect(parseCatalog(raw, resolveMui)).toEqual({ languages: [], layouts: [], regions: [] })
  })
})

describe('parseWriteResult', () => {
  it('treats empty output as a failure', () => {
    expect(parseWriteResult('')).toEqual({ ok: false, reason: 'no-output' })
  })

  it('reads the success and failure shapes the write script emits', () => {
    expect(parseWriteResult('{"ok":true}')).toEqual({ ok: true, reason: null })
    expect(parseWriteResult('{"ok":false,"reason":"no-input-methods"}')).toEqual({ ok: false, reason: 'no-input-methods' })
  })
})

describe('findInputMethodForLayout', () => {
  const state = parseLanguageState(READ_OUTPUT, resolveMui)

  it('picks the entry matching both the language and the layout', () => {
    expect(findInputMethodForLayout(state, 0x08070807).tip).toBe('0807:00000807')
    expect(findInputMethodForLayout(state, 0x08070809).tip).toBe('0809:00000807')
    expect(findInputMethodForLayout(state, 0x04070809).tip).toBe('0809:00000407')
  })

  it('falls back to the language when no layout matches', () => {
    expect(findInputMethodForLayout(state, 0xf0020807).tip).toBe('0807:00000807')
  })

  it('returns null when nothing matches', () => {
    expect(findInputMethodForLayout(state, 0x04090409)).toBe(null)
    expect(findInputMethodForLayout(null, 0x08070807)).toBe(null)
  })
})
