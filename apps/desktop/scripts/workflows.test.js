import { readdirSync, readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const workflowDir = new URL('../../../.github/workflows/', import.meta.url)
const workflows = Object.fromEntries(
  readdirSync(workflowDir)
    .filter((fileName) => fileName.endsWith('.yml'))
    .map((fileName) => [fileName, readFileSync(new URL(fileName, workflowDir), 'utf8').replace(/\r\n/g, '\n')]),
)
const ci = workflows['ci.yml']
const release = workflows['release.yml']
const nightly = workflows['nightly.yml']
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const rootPackageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))

const feedPublishStep = 'Publish installer + update feed to Railway'

function stepIndex(workflow, name) {
  return workflow.indexOf(`- name: ${name}\n`)
}

function stepBody(workflow, name) {
  const start = stepIndex(workflow, name)
  const next = workflow.indexOf('- name: ', start + 1)
  return workflow.slice(start, next === -1 ? undefined : next)
}

function bunInstallCommands(workflow) {
  return [...workflow.matchAll(/^\s*(?:run:\s*)?(bun install\b.*)$/gm)].map((match) => match[1])
}

function bunVersion(workflow) {
  return workflow.match(/^\s*bun-version: (\S+)$/m)?.[1]
}

describe('workflows', () => {
  it('pin every action to a full commit SHA with its version beside it', () => {
    for (const [fileName, workflow] of Object.entries(workflows)) {
      const references = [...workflow.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map((match) => match[1])
      for (const reference of references.filter((ref) => !ref.startsWith('./'))) {
        expect(reference, fileName).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/)
      }
    }
  })

  it('install exactly what bun.lock pins', () => {
    for (const workflow of [ci, release]) {
      const commands = bunInstallCommands(workflow)
      expect(commands.length).toBeGreaterThan(0)
      for (const command of commands) expect(command).toContain('--frozen-lockfile')
    }
  })

  it('check pull requests with the Bun that builds releases', () => {
    expect(bunVersion(ci)).toMatch(/^\d+\.\d+\.\d+$/)
    expect(bunVersion(ci)).toBe(bunVersion(release))
  })

  it('name the same Bun as the packageManager of the repo', () => {
    expect(rootPackageJson.packageManager).toBe(`bun@${bunVersion(ci)}`)
  })

  it('typecheck, lint and test every pull request', () => {
    for (const command of ['bun run typecheck', 'bun run lint', 'bun run test']) {
      expect(ci).toContain(`run: ${command}\n`)
    }
  })
})

describe('release workflow', () => {
  it('runs the whole CI check on the tagged commit before building the installer', () => {
    expect(ci).toMatch(/^on:\n(?: {2}.*\n)* {2}workflow_call:\n/m)
    expect(release).toContain('\n  verify:\n    uses: ./.github/workflows/ci.yml\n')
    expect(release).toContain('\n  build-and-publish:\n    needs: verify\n')
  })

  it('leaves the update feed alone for a pre-release that is not a nightly', () => {
    expect(stepBody(release, feedPublishStep)).toContain("if: env.PUBLISH_TO_FEED == 'true'")
    const validation = stepBody(release, 'Validate release tag and pick the channel')
    expect(validation).toContain('MARKED_PRERELEASE: ${{ github.event.release.prerelease == true }}')
    expect(validation).toContain('echo "FEED_CHANNEL=nightly" >> "$GITHUB_ENV"')
  })

  it('publishes one date-numbered bridge build through latest.yml for existing clients', () => {
    const validation = stepBody(release, 'Validate release tag and pick the channel')
    expect(validation).toContain('^0\\.[0-9]{8}\\.[0-9]+$')
    expect(validation).toContain('echo "FEED_CHANNEL=latest" >> "$GITHUB_ENV"')
    expect(validation).toContain('date-numbered bridge 0.YYYYMMDD.N')
  })

  it('writes the feed of the channel the tag belongs to', () => {
    const build = stepBody(release, 'Build installer')
    expect(packageJson.build.publish.channel).toBe('latest')
    expect(build.match(/-c\.publish\.channel="\$FEED_CHANNEL"/g)).toHaveLength(2)
    expect(build).toContain('test -f "release/$FEED_CHANNEL.yml"')
  })

  it('can be started on a tag by the nightly workflow', () => {
    expect(release).toMatch(/^on:\n(?: {2}.*\n)* {2}workflow_dispatch:\n/m)
  })

  it('publishes to the feed as the last step of the build job', () => {
    const buildJob = release.slice(release.indexOf('\n  build-and-publish:\n'), release.indexOf('\n  attach-to-release:\n'))
    expect(stepIndex(buildJob, feedPublishStep)).toBeGreaterThan(0)
    expect(buildJob.slice(stepIndex(buildJob, feedPublishStep) + 1)).not.toContain('- name: ')
  })

  it('replaces the installer artifact when the build job is re-run', () => {
    expect(stepBody(release, 'Keep the installer for the release')).toContain('overwrite: true')
  })

  it('keeps a write token away from the build and grants it to the attach job alone', () => {
    expect(release).toMatch(/^permissions:\n {2}contents: read\n/m)
    expect(release.match(/contents: write/g)).toHaveLength(1)
    expect(release.indexOf('contents: write')).toBeGreaterThan(release.indexOf('\n  attach-to-release:\n'))
    expect(stepBody(release, 'Checkout')).toContain('persist-credentials: false')
  })

  it('hands the signing certificate to electron-builder and nothing else', () => {
    expect(release.match(/secrets\.WIN_CSC_LINK }}/g)).toHaveLength(1)
    expect(stepBody(release, 'Build installer')).toContain('WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}')
    expect(stepBody(release, 'Build installer')).toContain('-c.forceCodeSigning=true')
  })

  it('checks every signature before the installer reaches the feed', () => {
    expect(stepIndex(release, 'Build installer')).toBeLessThan(stepIndex(release, 'Verify code signatures'))
    expect(stepIndex(release, 'Verify code signatures')).toBeLessThan(stepIndex(release, feedPublishStep))
    expect(stepBody(release, 'Verify code signatures')).toContain('-Include *.exe, *.dll, *.node')
  })

  it('signs the DLLs and native modules along with the executables', () => {
    expect(packageJson.build.win.signExts).toEqual(['.dll', '.node'])
  })
})

describe('nightly workflow', () => {
  it('cuts a pre-release from main and starts the release build on its tag', () => {
    expect(nightly).toMatch(/^ {4}- cron: '.+'$/m)
    expect(nightly).toContain('ref: main')
    expect(nightly).toContain('--prerelease')
    expect(nightly).toContain('gh workflow run release.yml --ref "v${VERSION}"')
  })

  it('skips the night when main has not moved', () => {
    expect(nightly).toContain('main has not changed since')
  })

  it('keeps a read-only token by default and writes only from the job that cuts the release', () => {
    expect(nightly).toMatch(/^permissions:\n {2}contents: read\n/m)
    expect(nightly.match(/contents: write/g)).toHaveLength(1)
    expect(stepBody(nightly, 'Checkout')).toContain('persist-credentials: false')
  })
})
