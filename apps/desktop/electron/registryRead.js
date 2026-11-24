const { execSync, execFileSync } = require('child_process')

function regQuery(keyPath, valueName) {
  try {
    const result = execSync(`reg query "${keyPath}" /v "${valueName}"`, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const match = result.match(/REG_\w+\s+(.+)/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

function parseRegistryValues(output) {
  const values = []
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^\s{4}(\S.*?)\s{4}REG_\w+\s*(.*)$/)
    if (match) values.push({ name: match[1].trim(), data: match[2].trim() })
  }
  return values
}

function regListValues(keyPath) {
  try {
    const output = execFileSync('reg', ['query', keyPath], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return parseRegistryValues(output)
  } catch {
    return []
  }
}

module.exports = { regQuery, regListValues, parseRegistryValues }
