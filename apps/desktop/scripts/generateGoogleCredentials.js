const fs = require('fs')
const path = require('path')

const ENV_PATH = path.join(__dirname, '..', '.env')
const OUTPUT_PATH = path.join(__dirname, '..', 'electron', 'modules', 'googleCredentials.generated.js')

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

function resolveCredentials() {
  const fromFile = parseEnvFile(ENV_PATH)
  const clientId = (process.env.ALPINE_GOOGLE_CLIENT_ID || fromFile.ALPINE_GOOGLE_CLIENT_ID || '').trim()
  const clientSecret = (process.env.ALPINE_GOOGLE_CLIENT_SECRET || fromFile.ALPINE_GOOGLE_CLIENT_SECRET || '').trim()
  return { clientId: clientId || null, clientSecret: clientSecret || null }
}

function run() {
  const { clientId, clientSecret } = resolveCredentials()
  const contents = `module.exports = {\n  clientId: ${JSON.stringify(clientId)},\n  clientSecret: ${JSON.stringify(clientSecret)},\n}\n`
  fs.writeFileSync(OUTPUT_PATH, contents, 'utf8')
  if (clientId && clientSecret) {
    console.log('[credentials] Baked shared Google client from .env')
  } else {
    console.log('[credentials] No Google client in .env — users paste their own in Settings')
  }
}

if (require.main === module) run()

module.exports = { run }
