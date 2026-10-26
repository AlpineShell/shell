const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const crateRoot = path.join(desktopRoot, 'native')
const builtLibrary = path.join(crateRoot, 'target', 'release', 'alpine_native.dll')
const addonDirectory = path.join(desktopRoot, 'electron', 'native')
const addonPath = path.join(addonDirectory, 'alpine_native.node')

function shouldSkipNativeBuild() {
  return process.env.ALPINE_SKIP_NATIVE === '1'
}

function runCargoBuild() {
  const result = spawnSync('cargo', ['build', '--release', '--manifest-path', path.join(crateRoot, 'Cargo.toml')], {
    stdio: 'inherit',
  })
  if (result.error) throw new Error(`could not run cargo: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`cargo build exited with code ${result.status}`)
}

function copyAddon() {
  fs.mkdirSync(addonDirectory, { recursive: true })
  fs.copyFileSync(builtLibrary, addonPath)
}

function buildNative() {
  if (shouldSkipNativeBuild()) {
    console.log('ALPINE_SKIP_NATIVE=1: skipping the native add-on build')
    return
  }
  runCargoBuild()
  copyAddon()
  console.log(`native add-on written to ${addonPath}`)
}

try {
  buildNative()
} catch (error) {
  console.error(`buildNative: ${error.message}`)
  process.exit(1)
}
