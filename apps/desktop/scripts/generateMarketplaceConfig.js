const fs = require('fs')
const path = require('path')

const ENV_PATH = path.join(__dirname, '..', '.env')
const OUTPUT_PATH = path.join(__dirname, '..', 'electron', 'marketplaceConfig.generated.js')

function parseEnvFile(filePath) {
  const result = {}
  if (!fs.existsSync(filePath)) return result
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

function run() {
  const fromFile = parseEnvFile(ENV_PATH)
  const base = (
    process.env.ALPINE_PLUGINS_BASE ||
    process.env.STORAGE_PUBLIC_URL ||
    fromFile.ALPINE_PLUGINS_BASE ||
    fromFile.STORAGE_PUBLIC_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '')
  const contents = `module.exports = {\n  pluginsBase: ${JSON.stringify(base || null)},\n}\n`
  fs.writeFileSync(OUTPUT_PATH, contents, 'utf8')
  if (base) {
    console.log(`[marketplace] Baked plugins base: ${base}`)
  } else {
    console.log('[marketplace] No plugins base in env/.env — app uses its built-in default')
  }
}

if (require.main === module) run()

module.exports = { run }
