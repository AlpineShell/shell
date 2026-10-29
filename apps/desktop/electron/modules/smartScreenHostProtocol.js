const USER_ACTIONS = new Set(['run', 'norun'])
const PUBLISHER_PLACEHOLDER = '@@PublisherName@@'

const NAMED_ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole
  })
}

function plainText(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function parseHostLine(line) {
  const parts = String(line).trim().split(' ')
  if (parts[0] === 'ready' && parts.length === 1) return { type: 'ready' }
  if (parts[0] === 'failed' && parts.length === 2) return { type: 'failed', code: parts[1] }
  if (parts[0] === 'prompt' && parts.length === 3 && /^\d+$/.test(parts[1])) {
    const html = Buffer.from(parts[2], 'base64').toString('utf8')
    if (!html) return null
    return { type: 'prompt', id: Number(parts[1]), html }
  }
  return null
}

function answerLine(id, userAction) {
  if (!Number.isInteger(id) || id <= 0) return null
  if (!USER_ACTIONS.has(userAction)) return null
  return `answer ${id} ${userAction}\n`
}

function elementText(html, id) {
  const match = new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</`, 'i').exec(html)
  return match ? plainText(match[1]) : ''
}

function buttonLabel(html, handler) {
  const match = new RegExp(`<button[^>]*onclick="${handler}\\(\\)"[^>]*>([\\s\\S]*?)</button>`, 'i').exec(html)
  return match ? plainText(match[1]) : ''
}

function publisherOverride(html) {
  const match = /var publisher = "([^"]*)"/.exec(html)
  if (!match || match[1] === PUBLISHER_PLACEHOLDER) return ''
  return plainText(match[1])
}

function detailRows(html) {
  const table = /<table[^>]*id="moreInfoTable"[^>]*>([\s\S]*?)<\/table>/i.exec(html)
  if (!table) return []
  const override = publisherOverride(html)
  const rows = []
  for (const row of table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
    if (cells.length < 2) continue
    const label = plainText(cells[0][2]).replace(/:\s*$/, '')
    const isPublisher = /id="publisher"/i.test(cells[1][1])
    const value = isPublisher && override ? override : plainText(cells[1][2])
    if (label && value) rows.push({ label, value })
  }
  return rows
}

function readPromptDetails(html) {
  return {
    title: elementText(html, 'messageTitle'),
    message: elementText(html, 'messageBody'),
    details: detailRows(html),
    runLabel: buttonLabel(html, 'runApp'),
    dontRunLabel: buttonLabel(html, 'dontRun'),
  }
}

module.exports = {
  parseHostLine,
  answerLine,
  readPromptDetails,
}
