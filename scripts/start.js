const path = require('path')
const { spawn } = require('child_process')

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
}

const targets = {
  app: { workspace: 'apps/desktop', script: 'start' },
  desktop: { workspace: 'apps/desktop', script: 'start' },
  web: { workspace: 'apps/web', script: 'dev' },
}

const menu = [
  { value: 'app', label: 'Desktop shell', detail: 'Vite + Electron' },
  { value: 'web', label: 'Website', detail: 'Next.js' },
]

function promptTarget() {
  return new Promise((resolve) => {
    const stdin = process.stdin
    let index = 0

    const render = (firstPaint) => {
      if (!firstPaint) process.stdout.write(`\x1b[${menu.length + 1}A`)
      process.stdout.write(`${c.bold}${c.cyan}?${c.reset} What do you want to start? ${c.dim}(↑/↓, enter)${c.reset}\x1b[K\n`)
      for (let i = 0; i < menu.length; i++) {
        const active = i === index
        const pointer = active ? `${c.green}❯${c.reset}` : ' '
        const label = active ? `${c.green}${menu[i].label}${c.reset}` : menu[i].label
        process.stdout.write(`  ${pointer} ${label} ${c.dim}— ${menu[i].detail}${c.reset}\x1b[K\n`)
      }
    }

    const cleanup = () => {
      stdin.removeListener('data', onKey)
      try { stdin.setRawMode(false) } catch {}
      stdin.pause()
    }

    const select = () => {
      cleanup()
      resolve(menu[index].value)
    }

    const cancel = () => {
      cleanup()
      process.stdout.write('\n')
      process.exit(130)
    }

    const onKey = (key) => {
      if (key === '\x03' || key === '\x1b' || key === 'q') return cancel()
      if (key === '\x1b[A' || key === 'k') {
        index = (index - 1 + menu.length) % menu.length
        render(false)
      } else if (key === '\x1b[B' || key === 'j') {
        index = (index + 1) % menu.length
        render(false)
      } else if (key === '1' || key === '2') {
        index = Number(key) - 1
        render(false)
        select()
      } else if (key === '\r' || key === '\n') {
        select()
      }
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    stdin.on('data', onKey)
    render(true)
  })
}

async function main() {
  const [requested, ...forwardedArgs] = process.argv.slice(2)
  let selected = requested

  if (!selected) {
    if (!process.stdin.isTTY) {
      const names = Object.keys(targets).join(' | ')
      console.error(`No start target given. Usage: bun start <${names}>`)
      process.exit(1)
    }
    selected = await promptTarget()
  }

  const target = targets[selected.toLowerCase()]
  if (!target) {
    const names = Object.keys(targets).join(' | ')
    console.error(`Unknown start target "${selected}". Usage: bun start <${names}>`)
    process.exit(1)
  }

  const child = spawn('bun', ['run', target.script, ...forwardedArgs], {
    cwd: path.join(__dirname, '..', target.workspace),
    stdio: 'inherit',
    shell: true,
  })

  const waitForChild = () => {}
  process.on('SIGINT', waitForChild)
  process.on('SIGTERM', waitForChild)

  child.on('exit', (code) => process.exit(code ?? 0))
}

main()
