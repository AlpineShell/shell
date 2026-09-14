import { describe, it, expect } from 'vitest'
import {
  parseInputMethodTip,
  formatInputMethodTip,
  parseInputMethodTips,
  isSafeLanguageTag,
  isSafeInputMethodTip,
  isKeyboardLayoutId,
  parseLayoutCatalogue,
  parseLanguageList,
  withLayoutNames,
  addInputMethodTip,
  removeInputMethodTip,
  reorderInputMethodTips,
  buildInputMethodTipList,
  composeKeyboardLayoutHandle,
  parseLanguageCatalogue,
  hasLanguageTag,
  buildAddLanguageCommand,
  buildRemoveLanguageCommand,
} from './keyboardLayoutParser.js'

const IME_TIP = '0411:{03B5835F-F03C-411B-9CE2-AA23E1171E36}{A76C93D9-5523-4E90-AAFA-4DB112F9AC76}'

describe('parseInputMethodTip', () => {
  it('splits a tip into its locale and its layout', () => {
    expect(parseInputMethodTip('0809:00000807')).toEqual({ localeId: '0809', layoutId: '00000807' })
  })

  it('lowercases both halves', () => {
    expect(parseInputMethodTip('0C0C:0002040C')).toEqual({ localeId: '0c0c', layoutId: '0002040c' })
  })

  it('tolerates the spacing Windows uses when it joins tips', () => {
    expect(parseInputMethodTip(' 0809:00000407 ')).toEqual({ localeId: '0809', layoutId: '00000407' })
  })

  it('keeps an input method editor profile pair intact', () => {
    expect(parseInputMethodTip(IME_TIP)).toEqual({
      localeId: '0411',
      layoutId: '{03B5835F-F03C-411B-9CE2-AA23E1171E36}{A76C93D9-5523-4E90-AAFA-4DB112F9AC76}',
    })
  })

  it.each(['', '00000807', '809:00000807', '0809:0000807', '0809:', 'nope:whatever', null, undefined])(
    'rejects %o',
    (value) => {
      expect(parseInputMethodTip(value)).toBe(null)
    }
  )
})

describe('formatInputMethodTip', () => {
  it('joins a locale and a layout back into a tip', () => {
    expect(formatInputMethodTip('0809', '00000407')).toBe('0809:00000407')
  })

  it('normalises the case of both halves', () => {
    expect(formatInputMethodTip('0C0C', '0002040C')).toBe('0c0c:0002040c')
  })

  it('returns null when the language has no resolved locale', () => {
    expect(formatInputMethodTip(null, '00000407')).toBe(null)
  })
})

describe('parseInputMethodTips', () => {
  it('parses the semicolon-separated form Get-WinUserLanguageList prints', () => {
    expect(parseInputMethodTips('0809:00000807; 0809:00000407')).toEqual(['0809:00000807', '0809:00000407'])
  })

  it('parses a comma-separated list', () => {
    expect(parseInputMethodTips('0809:00000807,0809:00000407')).toEqual(['0809:00000807', '0809:00000407'])
  })

  it('drops entries that are not tips and keeps the order of the rest', () => {
    expect(parseInputMethodTips('0809:00000807,rubbish,0407:00000407')).toEqual(['0809:00000807', '0407:00000407'])
  })

  it('reports a language with no input method as an empty list', () => {
    expect(parseInputMethodTips('')).toEqual([])
  })
})

describe('isSafeLanguageTag', () => {
  it.each(['en', 'en-GB', 'en-CH', 'sr-Latn-RS', 'zh-Hans-CN'])('accepts %s', (tag) => {
    expect(isSafeLanguageTag(tag)).toBe(true)
  })

  it.each(["en-GB'; Remove-Item C:", 'en GB', 'e', '', '$(whoami)', null])('rejects %o', (tag) => {
    expect(isSafeLanguageTag(tag)).toBe(false)
  })
})

describe('isSafeInputMethodTip', () => {
  it('accepts a keyboard layout tip', () => {
    expect(isSafeInputMethodTip('0809:00000807')).toBe(true)
  })

  it('rejects a tip carrying a quote', () => {
    expect(isSafeInputMethodTip("0809:00000807'")).toBe(false)
  })
})

describe('isKeyboardLayoutId', () => {
  it('accepts an eight digit layout id', () => {
    expect(isKeyboardLayoutId('0002040c')).toBe(true)
  })

  it('rejects an input method editor profile pair', () => {
    expect(isKeyboardLayoutId('{03B5835F-F03C-411B-9CE2-AA23E1171E36}')).toBe(false)
  })
})

describe('parseLayoutCatalogue', () => {
  const catalogue = [
    '00000407\tGerman',
    '00000401\tArabic (101)',
    '00000807\tSwiss German',
    '0002040C\tFrench (Standard, BÉPO)',
  ].join('\r\n')

  it('reads each subkey name and its Layout Text', () => {
    expect(parseLayoutCatalogue(catalogue)).toEqual([
      { id: '00000401', name: 'Arabic (101)' },
      { id: '0002040c', name: 'French (Standard, BÉPO)' },
      { id: '00000407', name: 'German' },
      { id: '00000807', name: 'Swiss German' },
    ])
  })

  it('sorts by display name so the catalogue reads alphabetically', () => {
    expect(parseLayoutCatalogue(catalogue).map((layout) => layout.name)).toEqual([
      'Arabic (101)',
      'French (Standard, BÉPO)',
      'German',
      'Swiss German',
    ])
  })

  it('keeps a name containing a tab', () => {
    expect(parseLayoutCatalogue('00000407\tGerman\tExtended')).toEqual([{ id: '00000407', name: 'German\tExtended' }])
  })

  it('skips subkeys with no Layout Text and rows that are not layouts', () => {
    expect(parseLayoutCatalogue('00000407\t\r\nnot-a-layout\tSomething\r\n\r\n00000409\tUS')).toEqual([
      { id: '00000409', name: 'US' },
    ])
  })

  it('keeps only the first row for a repeated layout id', () => {
    expect(parseLayoutCatalogue('00000409\tUS\r\n00000409\tUS again')).toEqual([{ id: '00000409', name: 'US' }])
  })

  it('reports empty output as an empty catalogue', () => {
    expect(parseLayoutCatalogue('')).toEqual([])
    expect(parseLayoutCatalogue(null)).toEqual([])
  })
})

describe('parseLanguageList', () => {
  const raw = [
    'en-CH\tEnglish (Switzerland)\tEnglish\t2000\t2000:00000407',
    'en-GB\tEnglish (United Kingdom)\tEnglish\t0809\t0809:00000807,0809:00000407',
  ].join('\r\n')

  it('reads one language per line with the layouts attached to it', () => {
    expect(parseLanguageList(raw)).toEqual([
      {
        tag: 'en-CH',
        autonym: 'English (Switzerland)',
        name: 'English',
        localeId: '2000',
        layouts: ['2000:00000407'],
      },
      {
        tag: 'en-GB',
        autonym: 'English (United Kingdom)',
        name: 'English',
        localeId: '0809',
        layouts: ['0809:00000807', '0809:00000407'],
      },
    ])
  })

  it('reports a language carrying no layout as an empty list', () => {
    expect(parseLanguageList('en-CH\tEnglish (Switzerland)\tEnglish\t2000\t')[0].layouts).toEqual([])
  })

  it('falls back to the tag when Windows gives no display name', () => {
    expect(parseLanguageList('en-GB\t\t\t0809\t')[0]).toMatchObject({ autonym: 'en-GB', name: 'en-GB' })
  })

  it('reports an unresolvable locale id as null rather than guessing', () => {
    expect(parseLanguageList('en-GB\tEnglish\tEnglish\t0000000\t')[0].localeId).toBe(null)
  })

  it('skips lines that are not a language', () => {
    expect(parseLanguageList('\r\nWARNING: something happened\r\nen-GB\tEnglish\tEnglish\t0809\t')).toHaveLength(1)
  })
})

describe('withLayoutNames', () => {
  const catalogue = [
    { id: '00000807', name: 'Swiss German' },
    { id: '00000407', name: 'German' },
  ]

  it('names every layout from the catalogue', () => {
    const [language] = withLayoutNames(parseLanguageList('en-GB\tEnglish\tEnglish\t0809\t0809:00000807'), catalogue)
    expect(language.layouts).toEqual([
      { tip: '0809:00000807', localeId: '0809', layoutId: '00000807', name: 'Swiss German' },
    ])
  })

  it('falls back to the layout id when the catalogue does not carry it', () => {
    const [language] = withLayoutNames(parseLanguageList('en-GB\tEnglish\tEnglish\t0809\t0809:0000dead'), catalogue)
    expect(language.layouts[0].name).toBe('0000dead')
  })

  it('leaves the rest of the language untouched', () => {
    const [language] = withLayoutNames(parseLanguageList('en-GB\tEnglish\tEnglish\t0809\t0809:00000407'), catalogue)
    expect(language).toMatchObject({ tag: 'en-GB', autonym: 'English', localeId: '0809' })
  })
})

describe('addInputMethodTip', () => {
  it('appends a layout after the ones already on the language', () => {
    expect(addInputMethodTip(['0809:00000807'], '0809:00000407')).toEqual(['0809:00000807', '0809:00000407'])
  })

  it('leaves the list alone when the layout is already there', () => {
    const tips = ['0809:00000807']
    expect(addInputMethodTip(tips, '0809:00000807')).toBe(tips)
  })

  it('refuses a tip it cannot parse', () => {
    const tips = ['0809:00000807']
    expect(addInputMethodTip(tips, 'nonsense')).toBe(tips)
  })
})

describe('removeInputMethodTip', () => {
  it('drops the layout and keeps the order of the rest', () => {
    expect(removeInputMethodTip(['0809:00000807', '0809:00000407', '0809:00000409'], '0809:00000407')).toEqual([
      '0809:00000807',
      '0809:00000409',
    ])
  })

  it('leaves a list that does not carry the layout unchanged', () => {
    expect(removeInputMethodTip(['0809:00000807'], '0809:00000409')).toEqual(['0809:00000807'])
  })

  it('can empty a language', () => {
    expect(removeInputMethodTip(['0809:00000807'], '0809:00000807')).toEqual([])
  })
})

describe('reorderInputMethodTips', () => {
  it('puts the layouts in the requested order', () => {
    expect(reorderInputMethodTips(['0809:00000807', '0809:00000407'], ['0809:00000407', '0809:00000807'])).toEqual([
      '0809:00000407',
      '0809:00000807',
    ])
  })

  it('ignores layouts the language does not carry', () => {
    expect(reorderInputMethodTips(['0809:00000807'], ['0809:00000409', '0809:00000807'])).toEqual(['0809:00000807'])
  })

  it('keeps layouts the caller left out, after the ones it named', () => {
    expect(reorderInputMethodTips(['0809:00000807', '0809:00000407'], ['0809:00000407'])).toEqual([
      '0809:00000407',
      '0809:00000807',
    ])
  })

  it('treats an empty order as no reordering at all', () => {
    expect(reorderInputMethodTips(['0809:00000807', '0809:00000407'], [])).toEqual([
      '0809:00000807',
      '0809:00000407',
    ])
  })
})

describe('buildInputMethodTipList', () => {
  it('builds the ordered array Set-WinUserLanguageList is handed', () => {
    expect(buildInputMethodTipList(['0809:00000807', '0809:00000407'])).toBe("@('0809:00000807','0809:00000407')")
  })

  it('builds an empty array for a language left with no layout', () => {
    expect(buildInputMethodTipList([])).toBe('@()')
  })

  it('drops anything that is not a tip rather than passing it to PowerShell', () => {
    expect(buildInputMethodTipList(['0809:00000807', "'; Remove-Item C: -Recurse; '"])).toBe("@('0809:00000807')")
  })

  it('quotes an input method editor profile pair as one argument', () => {
    expect(buildInputMethodTipList([IME_TIP])).toBe(`@('${IME_TIP}')`)
  })
})

describe('composeKeyboardLayoutHandle', () => {
  it('puts the layout in the high word and the language in the low word', () => {
    expect(composeKeyboardLayoutHandle('0809:00000407')).toBe(0x04070809)
  })

  it('composes a layout that belongs to its own language', () => {
    expect(composeKeyboardLayoutHandle('0407:00000407')).toBe(0x04070407)
  })

  it('keeps the result unsigned for a layout in the top half of the word', () => {
    expect(composeKeyboardLayoutHandle('0809:0000f00d')).toBe(0xf00d0809)
  })

  it('uses only the low word of a device layout id', () => {
    expect(composeKeyboardLayoutHandle('0c0c:0002040c')).toBe(0x040c0c0c)
  })

  it('reports no handle for an input method editor, which has none', () => {
    expect(composeKeyboardLayoutHandle(IME_TIP)).toBe(0)
  })

  it('reports no handle for a tip it cannot parse', () => {
    expect(composeKeyboardLayoutHandle('rubbish')).toBe(0)
  })
})

describe('parseLanguageCatalogue', () => {
  const raw = [
    'fr-FR\tfrançais (France)\tFrench (France)',
    'de-CH\tDeutsch (Schweiz)\tGerman (Switzerland)',
    'aa-DJ\tQafar (Yabuuti)\tAfar (Djibouti)',
  ].join('\r\n')

  it('reads the tag, English name and native name of every culture, sorted by English name', () => {
    expect(parseLanguageCatalogue(raw)).toEqual([
      { tag: 'aa-DJ', name: 'Afar (Djibouti)', nativeName: 'Qafar (Yabuuti)' },
      { tag: 'fr-FR', name: 'French (France)', nativeName: 'français (France)' },
      { tag: 'de-CH', name: 'German (Switzerland)', nativeName: 'Deutsch (Schweiz)' },
    ])
  })

  it('falls back to the English name, then to the tag, when Windows gives no name', () => {
    expect(parseLanguageCatalogue('en-GB\t\tEnglish (United Kingdom)\r\nsr-Latn-RS\t\t')).toEqual([
      { tag: 'en-GB', name: 'English (United Kingdom)', nativeName: 'English (United Kingdom)' },
      { tag: 'sr-Latn-RS', name: 'sr-Latn-RS', nativeName: 'sr-Latn-RS' },
    ])
  })

  it('keeps only the first row for a tag repeated in another case', () => {
    expect(parseLanguageCatalogue('fr-FR\tfrançais\tFrench\r\nFR-fr\tautre\tOther')).toHaveLength(1)
  })

  it('skips a row whose tag could smuggle anything into PowerShell', () => {
    expect(parseLanguageCatalogue("en-GB'; Remove-Item C:\tEnglish\tEnglish\r\nnot a tag\tX\tY")).toEqual([])
  })

  it('reports empty output as an empty catalogue', () => {
    expect(parseLanguageCatalogue('')).toEqual([])
    expect(parseLanguageCatalogue(null)).toEqual([])
  })
})

describe('hasLanguageTag', () => {
  const languages = [{ tag: 'de-CH' }, { tag: 'en-GB' }]

  it('finds a language whatever the case of the tag', () => {
    expect(hasLanguageTag(languages, 'EN-gb')).toBe(true)
  })

  it('reports a language that is not in the list', () => {
    expect(hasLanguageTag(languages, 'fr-FR')).toBe(false)
    expect(hasLanguageTag(languages, undefined)).toBe(false)
  })
})

describe('buildAddLanguageCommand', () => {
  it('appends the language to the list Windows already has and writes the whole list back', () => {
    expect(buildAddLanguageCommand('fr-FR')).toBe(
      "$list = Get-WinUserLanguageList; $list.Add('fr-FR'); Set-WinUserLanguageList -LanguageList $list -Force -WarningAction SilentlyContinue"
    )
  })

  it('never builds a command that holds a double quote, which would end the powershell -Command string', () => {
    expect(buildAddLanguageCommand('sr-Latn-RS')).not.toContain('"')
  })

  it.each(["fr-FR'); Remove-Item C: -Recurse; ('", 'fr FR', '', null, undefined])('refuses %o', (tag) => {
    expect(buildAddLanguageCommand(tag)).toBe(null)
  })
})

describe('buildRemoveLanguageCommand', () => {
  it('drops the matching language and writes the list back only while another language remains', () => {
    expect(buildRemoveLanguageCommand('fr-FR')).toBe(
      "$list = Get-WinUserLanguageList; $target = $null; foreach ($language in $list) { if ($language.LanguageTag -eq 'fr-FR') { $target = $language } }; if ($target -and $list.Count -gt 1) { [void]$list.Remove($target); Set-WinUserLanguageList -LanguageList $list -Force -WarningAction SilentlyContinue }"
    )
  })

  it('never builds a command that holds a double quote, which would end the powershell -Command string', () => {
    expect(buildRemoveLanguageCommand('zh-Hans-CN')).not.toContain('"')
  })

  it.each(["fr-FR' } }; Remove-Item C: -Recurse; { '", '$(whoami)', '', null])('refuses %o', (tag) => {
    expect(buildRemoveLanguageCommand(tag)).toBe(null)
  })
})
