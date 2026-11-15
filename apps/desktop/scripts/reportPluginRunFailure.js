const { parseArgs } = require('node:util')
const { postCallback } = require('./pluginCallback')

const FAILURE_STAGES = new Set(['build', 'publish', 'revoke'])

const USAGE =
  'Usage: node scripts/reportPluginRunFailure.js --stage <build|publish|revoke> --callback <url> [--run-url <url>] [--error <message>]'

async function reportPluginRunFailure({ stage, callback, runUrl, error }, deps) {
  if (!FAILURE_STAGES.has(stage)) throw new Error(`Invalid stage: ${stage}`)
  const payload = { ok: false, runUrl: runUrl || null, error: error || `The ${stage} job failed` }
  await postCallback(callback, stage === 'revoke' ? payload : { stage, ...payload }, deps)
}

async function main(argv, deps) {
  const options = { stage: { type: 'string' }, callback: { type: 'string' }, 'run-url': { type: 'string' }, error: { type: 'string' } }
  const { values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false })
  if (!values.stage || !values.callback) throw new Error(USAGE)
  await reportPluginRunFailure({ stage: values.stage, callback: values.callback, runUrl: values['run-url'], error: values.error }, deps)
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { main, reportPluginRunFailure }
