const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { parseArgs } = require('node:util')
const { CONTRIBUTION_KEYS } = require('../electron/pluginManifest')
const { extractZip } = require('../electron/pluginZip')
const { assertAppLoadsPlugin } = require('./pluginAppCheck')
const { packBundle, readIgnorePatterns, sha256 } = require('./pluginBundle')
const { postCallback, reportFailure } = require('./pluginCallback')
const { reportPluginRunFailure } = require('./reportPluginRunFailure')
const { readManifestFile, assertPluginId, assertPluginVersion } = require('./pluginManifestFile')
const { NO_CACHE, publishBundle } = require('./pluginPublisher')
const { resolveSigningKey, signDocument } = require('./pluginSigning')
const { createStorage } = require('./pluginStorage')

const MAX_BUNDLE_BYTES = 25 * 1024 * 1024
const COMMUNITY_IGNORES = ['.github']
const BUNDLE_FILE = 'bundle.alpineplugin'
const MANIFEST_FILE = 'manifest.json'
const FILES_FILE = 'files.json'
const REVOCATIONS_KEY = 'plugins/revoked.json'
const REVOCATIONS_VERSION = 1
const REVOCATIONS_TIMEOUT_MS = 15000
const PACKAGE_MANAGERS = new Set(['bun', 'npm'])
const SHELL_SAFE_ARGUMENT = /^[A-Za-z0-9@._\/:=-]+$/
const CONTRIBUTION_FIELDS = new Set(['settings', ...CONTRIBUTION_KEYS])
const SUBMISSION_ID = /^[A-Za-z0-9_-]{1,128}$/
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const COMMIT_SHA = /^[0-9a-f]{40}$/
const SHA256_HEX = /^[0-9a-f]{64}$/
const stagingKey = (submissionId) => `plugins-staging/${submissionId}.alpineplugin`

function needsShell(command) {
  return process.platform === 'win32' && PACKAGE_MANAGERS.has(command)
}

function shellCommandLine(command, args) {
  const unsafe = [command, ...args].find((part) => !SHELL_SAFE_ARGUMENT.test(part))
  if (unsafe !== undefined) throw new Error(`Refusing to pass ${JSON.stringify(unsafe)} through the shell`)
  return [command, ...args].join(' ')
}

function spawnCommand(command, args, options) {
  if (needsShell(command)) return spawnSync(shellCommandLine(command, args), { ...options, shell: true })
  return spawnSync(command, args, options)
}

function runCommand(command, args, cwd) {
  const result = spawnCommand(command, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
}

function defaultDeps() {
  return { run: runCommand, fetch: globalThis.fetch, env: process.env, now: () => new Date(), tmpdir: os.tmpdir }
}

function assertMatches(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`Invalid ${label}: ${value}`)
}

function assertNotBlank(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`)
}

function readPackageJson(checkoutDir) {
  const packagePath = path.join(checkoutDir, 'package.json')
  if (!fs.existsSync(packagePath)) return null
  return JSON.parse(fs.readFileSync(packagePath, 'utf8').replace(/^\uFEFF/, ''))
}

function packageManagerFor(checkoutDir) {
  return ['bun.lock', 'bun.lockb'].some((file) => fs.existsSync(path.join(checkoutDir, file))) ? 'bun' : 'npm'
}

function runPluginBuild(checkoutDir, run) {
  const packageJson = readPackageJson(checkoutDir)
  if (typeof packageJson?.scripts?.build !== 'string') return
  const packageManager = packageManagerFor(checkoutDir)
  run(packageManager, ['install'], checkoutDir)
  run(packageManager, ['run', 'build'], checkoutDir)
}

function unknownFieldProblem(field) {
  if (CONTRIBUTION_FIELDS.has(field)) return `"${field}" is not a top-level field, it belongs under "contributes"`
  return `"${field}" is not a plugin.json field`
}

function assertKnownManifestFields(manifest) {
  const { PLUGIN_MANIFEST_FIELDS } = require('@alpine/plugin-sdk')
  const known = new Set(PLUGIN_MANIFEST_FIELDS)
  const unknown = Object.keys(manifest).filter((field) => !known.has(field))
  if (unknown.length > 0) throw new Error(`plugin.json is not valid: ${unknown.map(unknownFieldProblem).join('; ')}`)
}

function assertSupportedApiVersion(manifest) {
  const { SUPPORTED_API_VERSIONS, isSupportedApiVersion } = require('@alpine/plugin-sdk')
  const { apiVersion } = manifest
  if (!Number.isInteger(apiVersion) || isSupportedApiVersion(apiVersion)) return
  throw new Error(`plugin.json has "apiVersion": ${apiVersion}, but Alpine Shell supports apiVersion ${SUPPORTED_API_VERSIONS.join(', ')}`)
}

function validateCommunityManifest(manifest) {
  const { isValidId, validateManifestShape } = require('@alpine/plugin-sdk')
  if (!manifest || typeof manifest !== 'object' || !isValidId(manifest.id)) {
    throw new Error(`plugin.json needs an "id" that is your developer organisation's slug, a dot and a name, such as example-labs.hello`)
  }
  assertKnownManifestFields(manifest)
  assertSupportedApiVersion(manifest)
  const result = validateManifestShape(manifest)
  if (!result.ok) {
    const issues = result.issues.map((issue) => `${issue.path || 'plugin.json'}: ${issue.message}`)
    throw new Error(`plugin.json is not valid: ${issues.join('; ')}`)
  }
}

function assertBundleSize(size) {
  if (size > MAX_BUNDLE_BYTES) throw new Error(`The bundle is ${size} bytes, more than the ${MAX_BUNDLE_BYTES} bytes the app installs`)
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function build({ dir, out }, deps) {
  const checkoutDir = path.resolve(dir)
  const outDir = path.resolve(out)
  runPluginBuild(checkoutDir, deps.run)
  const manifest = readManifestFile(checkoutDir)
  validateCommunityManifest(manifest)
  const { bundle, files } = packBundle(checkoutDir, [...COMMUNITY_IGNORES, ...readIgnorePatterns(checkoutDir)])
  assertBundleSize(bundle.length)
  await withExtractedBundle(bundle, deps.tmpdir(), (bundleDir) => assertAppLoadsPlugin(bundleDir, manifest.id))
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, BUNDLE_FILE), bundle)
  writeJson(path.join(outDir, MANIFEST_FILE), manifest)
  writeJson(path.join(outDir, FILES_FILE), files)
  console.log(`Built ${manifest.id}@${manifest.version} (${bundle.length} bytes, ${files.length} files)`)
  return { manifest, files, size: bundle.length }
}

async function withExtractedBundle(bundle, tmpRoot, inspect) {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'alpine-bundle-'))
  try {
    const written = extractZip(bundle, dir)
    return await inspect(dir, written)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function bundledManifest(dir) {
  const manifest = readManifestFile(dir)
  assertPluginId(manifest.id)
  assertPluginVersion(manifest.version)
  return manifest
}

function describeBundle(dir, written) {
  const files = [...written].sort().map((file) => ({ path: file, size: fs.statSync(path.join(dir, file)).size }))
  return { manifest: bundledManifest(dir), files }
}

async function stageBundle({ submission, out, store, runUrl }, deps) {
  assertMatches(submission, SUBMISSION_ID, 'submission id')
  const bundle = fs.readFileSync(path.join(path.resolve(out), BUNDLE_FILE))
  assertBundleSize(bundle.length)
  const { manifest, files } = await withExtractedBundle(bundle, deps.tmpdir(), describeBundle)
  await createStorage(store).put(stagingKey(submission), bundle, 'application/zip', NO_CACHE)
  return { stage: 'build', ok: true, runUrl: runUrl || null, sha256: sha256(bundle).hex, size: bundle.length, manifest, files }
}

async function stage(options, deps) {
  const payload = await stageBundle(options, deps)
  await postCallback(options.callback, payload, deps)
  console.log(`Staged ${payload.manifest.id}@${payload.manifest.version} for submission ${options.submission}`)
}

function cloneCommit(repository, commit, checkoutDir, run) {
  run('git', ['clone', '--quiet', `https://github.com/${repository}.git`, checkoutDir], path.dirname(checkoutDir))
  run('git', ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', commit], checkoutDir)
}

async function buildAndStage({ submission, repository, commit, store }, workDir, deps) {
  assertMatches(submission, SUBMISSION_ID, 'submission id')
  assertMatches(repository, REPOSITORY, 'repository')
  assertMatches(commit, COMMIT_SHA, 'commit')
  const checkoutDir = path.join(workDir, 'plugin')
  const outDir = path.join(workDir, 'out')
  cloneCommit(repository, commit, checkoutDir, deps.run)
  await build({ dir: checkoutDir, out: outDir }, deps)
  return stageBundle({ submission, out: outDir, store }, deps)
}

async function localBuild(options, deps) {
  const workDir = fs.mkdtempSync(path.join(deps.tmpdir(), 'alpine-community-build-'))
  let payload
  try {
    payload = await buildAndStage(options, workDir, deps)
  } catch (error) {
    await reportFailure(options.callback, { stage: 'build', ok: false, runUrl: null, error: error.message }, deps)
    throw error
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 3 })
  }
  await postCallback(options.callback, payload, deps)
  console.log(`Staged ${payload.manifest.id}@${payload.manifest.version} for submission ${options.submission}`)
}

async function readStagedBundle(storage, submission, expectedSha256) {
  const bundle = await storage.get(stagingKey(submission))
  if (!bundle) throw new Error(`No staged bundle for submission ${submission}`)
  const actual = sha256(bundle).hex
  if (actual !== expectedSha256) {
    throw new Error(`Refusing to publish: the staged bundle has sha256 ${actual}, but the reviewed bundle has ${expectedSha256}`)
  }
  return bundle
}

async function publishStaged({ submission, sha256: reviewedSha256, publisherSlug, publisherName, store }, deps) {
  assertMatches(submission, SUBMISSION_ID, 'submission id')
  assertMatches(reviewedSha256, SHA256_HEX, 'sha256')
  assertNotBlank(publisherSlug, 'publisher slug')
  assertNotBlank(publisherName, 'publisher name')
  const signingKey = resolveSigningKey({ env: deps.env, storeDir: store })
  const storage = createStorage(store)
  const bundle = await readStagedBundle(storage, submission, reviewedSha256)
  const listing = { publisher: { slug: publisherSlug, name: publisherName } }
  return withExtractedBundle(bundle, deps.tmpdir(), (dir) =>
    publishBundle({ storage, pluginDir: dir, bundle, manifest: bundledManifest(dir), signingKey, listing })
  )
}

async function publish(options, deps) {
  let latest
  try {
    latest = await publishStaged(options, deps)
  } catch (error) {
    await reportFailure(options.callback, { stage: 'publish', ok: false, runUrl: options.runUrl || null, error: error.message }, deps)
    throw error
  }
  await postCallback(options.callback, { stage: 'publish', ok: true, runUrl: options.runUrl || null }, deps)
  console.log(`Published ${latest.id}@${latest.version} by ${options.publisherName} (${latest.size} bytes, signed)`)
}

function revocationEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('The revocation list holds an entry that is not an object')
  assertPluginId(entry.id)
  if (entry.version != null) assertPluginVersion(entry.version)
  return { id: entry.id, version: entry.version ?? null, reason: typeof entry.reason === 'string' ? entry.reason : '' }
}

async function fetchRevocations(listUrl, fetchImpl) {
  const response = await fetchImpl(listUrl, { signal: AbortSignal.timeout(REVOCATIONS_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`The revocation list answered ${response.status}`)
  const body = await response.json()
  if (!body || !Array.isArray(body.revoked)) throw new Error('The revocation list has no "revoked" array')
  return body.revoked.map(revocationEntry)
}

async function publishRevocations({ listUrl, store }, deps) {
  const signingKey = resolveSigningKey({ env: deps.env, storeDir: store })
  const storage = createStorage(store)
  const revoked = await fetchRevocations(listUrl, deps.fetch)
  const document = signDocument({ version: REVOCATIONS_VERSION, issuedAt: deps.now().toISOString(), revoked }, signingKey)
  await storage.put(REVOCATIONS_KEY, JSON.stringify(document, null, 2), 'application/json', NO_CACHE)
  return document
}

async function revoke(options, deps) {
  let document
  try {
    document = await publishRevocations(options, deps)
  } catch (error) {
    await reportFailure(options.callback, { ok: false, runUrl: options.runUrl || null, error: error.message }, deps)
    throw error
  }
  await postCallback(options.callback, { ok: true, runUrl: options.runUrl || null }, deps)
  console.log(`Published the revocation list (${document.revoked.length} revoked)`)
}

const stringFlag = { type: 'string' }

const COMMANDS = {
  build: {
    options: { dir: stringFlag, out: stringFlag },
    required: ['dir', 'out'],
    run: (values, deps) => build({ dir: values.dir, out: values.out }, deps),
  },
  stage: {
    options: { submission: stringFlag, out: stringFlag, callback: stringFlag, 'run-url': stringFlag, store: stringFlag },
    required: ['submission', 'out', 'callback'],
    run: (values, deps) =>
      stage({ submission: values.submission, out: values.out, callback: values.callback, runUrl: values['run-url'], store: values.store }, deps),
  },
  'local-build': {
    options: { submission: stringFlag, repository: stringFlag, commit: stringFlag, store: stringFlag, callback: stringFlag },
    required: ['submission', 'repository', 'commit', 'callback'],
    run: (values, deps) =>
      localBuild(
        { submission: values.submission, repository: values.repository, commit: values.commit, store: values.store, callback: values.callback },
        deps
      ),
  },
  publish: {
    options: {
      submission: stringFlag,
      sha256: stringFlag,
      'publisher-slug': stringFlag,
      'publisher-name': stringFlag,
      callback: stringFlag,
      'run-url': stringFlag,
      store: stringFlag,
    },
    required: ['submission', 'sha256', 'publisher-slug', 'publisher-name', 'callback'],
    run: (values, deps) =>
      publish(
        {
          submission: values.submission,
          sha256: values.sha256.toLowerCase(),
          publisherSlug: values['publisher-slug'],
          publisherName: values['publisher-name'],
          callback: values.callback,
          runUrl: values['run-url'],
          store: values.store,
        },
        deps
      ),
  },
  revoke: {
    options: { 'list-url': stringFlag, callback: stringFlag, 'run-url': stringFlag, store: stringFlag },
    required: ['list-url', 'callback'],
    run: (values, deps) =>
      revoke({ listUrl: values['list-url'], callback: values.callback, runUrl: values['run-url'], store: values.store }, deps),
  },
  'report-failure': {
    options: { stage: stringFlag, callback: stringFlag, 'run-url': stringFlag, error: stringFlag },
    required: ['stage', 'callback'],
    run: (values, deps) =>
      reportPluginRunFailure({ stage: values.stage, callback: values.callback, runUrl: values['run-url'], error: values.error }, deps),
  },
}

const USAGE = [
  'Usage: node scripts/communityPlugin.js <command> [flags]',
  '  build --dir <checkout> --out <dir>',
  '  stage --submission <id> --out <dir> --callback <url> [--run-url <url>] [--store <dir>]',
  '  local-build --submission <id> --repository <owner/repo> --commit <sha> --callback <url> [--store <dir>]',
  '  publish --submission <id> --sha256 <hex> --publisher-slug <slug> --publisher-name <name> --callback <url> [--run-url <url>] [--store <dir>]',
  '  revoke --list-url <url> --callback <url> [--run-url <url>] [--store <dir>]',
  '  report-failure --stage <build|publish|revoke> --callback <url> [--run-url <url>] [--error <message>]',
].join('\n')

async function main(argv, deps = defaultDeps()) {
  const [command, ...args] = argv
  const definition = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : null
  if (!definition) throw new Error(USAGE)
  const { values } = parseArgs({ args, options: definition.options, strict: true, allowPositionals: false })
  const missing = definition.required.filter((name) => !values[name])
  if (missing.length > 0) throw new Error(`Missing ${missing.map((name) => `--${name}`).join(', ')}\n${USAGE}`)
  await definition.run(values, deps)
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { MAX_BUNDLE_BYTES, build, localBuild, main, publish, revoke, stage, stagingKey }
