const TITLE_SEPARATORS = [' - ', ' — ', ' – ', ' | ']

function exeFileName(exePath) {
  if (!exePath) return ''
  return String(exePath).split(/[\\/]/).pop().toLowerCase()
}

function ruleMatchesWindow(rule, { exePath, className, title }) {
  if (!rule || !className || !title) return false
  if (rule.className !== className) return false
  if (rule.process !== exeFileName(exePath)) return false
  return !rule.titleSuffix || title.endsWith(rule.titleSuffix)
}

function findWindowRule(rules, windowFacts) {
  return rules.find((rule) => ruleMatchesWindow(rule, windowFacts)) || null
}

function appTitleFor(rule, title) {
  if (!rule.titleSuffix || !title.endsWith(rule.titleSuffix)) return title.trim()
  return title.slice(0, title.length - rule.titleSuffix.length).trim()
}

function endsWithSeparatedName(appTitle, name) {
  return TITLE_SEPARATORS.some((separator) => appTitle.endsWith(`${separator}${name}`))
}

function shortcutNameForTitle(appTitle, shortcutNames) {
  const wanted = appTitle.toLowerCase()
  let best = null
  for (const shortcutName of shortcutNames) {
    const candidate = shortcutName.toLowerCase()
    const matches = candidate === wanted || endsWithSeparatedName(wanted, candidate)
    if (matches && (!best || shortcutName.length > best.length)) best = shortcutName
  }
  return best
}

module.exports = { exeFileName, ruleMatchesWindow, findWindowRule, appTitleFor, shortcutNameForTitle }
