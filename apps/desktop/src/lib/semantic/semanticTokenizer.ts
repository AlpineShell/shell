const MAX_WORD_CHARS = 100
const CONTINUATION_PREFIX = "##"

function isCjkIdeograph(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    (code >= 0x2a700 && code <= 0x2ceaf) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x2f800 && code <= 0x2fa1f)
  )
}

function isAsciiPunctuation(code: number): boolean {
  return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126)
}

function isPunctuation(char: string): boolean {
  return isAsciiPunctuation(char.codePointAt(0) ?? 0) || /\p{P}/u.test(char)
}

export function normalizeForSearch(text: string): string {
  let cleaned = ""
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code === 0 || code === 0xfffd) continue
    if (/\s/u.test(char)) cleaned += " "
    else if (/\p{Cc}/u.test(char)) continue
    else cleaned += isCjkIdeograph(code) ? ` ${char} ` : char
  }
  return cleaned.toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/\p{Mn}/gu, "")
}

export function splitWords(normalized: string): string[] {
  const words: string[] = []
  for (const chunk of normalized.split(" ")) {
    let current = ""
    for (const char of chunk) {
      if (!isPunctuation(char)) {
        current += char
        continue
      }
      if (current) words.push(current)
      words.push(char)
      current = ""
    }
    if (current) words.push(current)
  }
  return words
}

export function wordPieceIds(word: string, vocab: ReadonlyMap<string, number>): number[] {
  if (word.length > MAX_WORD_CHARS) return []
  const ids: number[] = []
  let start = 0
  while (start < word.length) {
    let end = word.length
    let found: number | undefined
    while (start < end) {
      found = vocab.get((start > 0 ? CONTINUATION_PREFIX : "") + word.slice(start, end))
      if (found !== undefined) break
      end--
    }
    if (found === undefined) return []
    ids.push(found)
    start = end
  }
  return ids
}

export function tokenIds(text: string, vocab: ReadonlyMap<string, number>): number[] {
  return splitWords(normalizeForSearch(text)).flatMap((word) => wordPieceIds(word, vocab))
}
