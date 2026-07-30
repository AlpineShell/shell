const SHELL_LINK = /alpine-shell:\/\/[^\s"']+/i

function shellLinkInShortcut(info) {
  if (!info) return null
  const fields = [info.args, info.target]
  for (const field of fields) {
    if (typeof field !== 'string' || !field) continue
    const match = field.match(SHELL_LINK)
    if (match) return match[0]
  }
  return null
}

module.exports = { shellLinkInShortcut }
