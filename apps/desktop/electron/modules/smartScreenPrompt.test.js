import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const PROMPT_HTML = `<div id="messageTitle">Windows protected your PC</div>
<div id="messageBody">Microsoft Defender SmartScreen prevented an unrecognised app from starting.</div>
<button onclick="dontRun()">Don't run</button>`

function fakeTopBar() {
  return {
    webContents: { send: vi.fn() },
    isDestroyed: () => false,
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    restorePassiveTopBar: vi.fn(),
  }
}

let prompt
let topBar
let answers

async function loadPrompt() {
  vi.resetModules()
  const loaded = await import('./smartScreenPrompt.js')
  prompt = loaded.default ?? loaded
  topBar = fakeTopBar()
  answers = []
  prompt.setShells(new Map([[1, { topBar }]]))
  prompt.setDisplayProvider(() => ({ id: 1 }))
  prompt.setAnswerSink((id, action) => answers.push([id, action]))
}

function shownPayloads(win = topBar) {
  return win.webContents.send.mock.calls.filter(([channel]) => channel === 'smartscreen/show').map(([, payload]) => payload)
}

beforeEach(async () => {
  vi.useFakeTimers()
  await loadPrompt()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('smartScreenPrompt', () => {
  it('shows the prompt on the topbar of the active display and takes its clicks', () => {
    prompt.show({ id: 4, html: PROMPT_HTML })
    expect(shownPayloads()).toEqual([expect.objectContaining({ id: 4, title: 'Windows protected your PC', dontRunLabel: "Don't run" })])
    expect(topBar.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    expect(prompt.isActive(topBar)).toBe(true)
  })

  it('passes the answer from that topbar on and hides the prompt', () => {
    prompt.show({ id: 4, html: PROMPT_HTML })
    prompt.handlers['smartscreen/answer']({ sender: topBar.webContents }, 4, 'run')
    expect(answers).toEqual([[4, 'run']])
    expect(topBar.webContents.send).toHaveBeenCalledWith('smartscreen/hide')
    expect(prompt.isActive(topBar)).toBe(false)
    vi.advanceTimersByTime(300)
    expect(topBar.restorePassiveTopBar).toHaveBeenCalled()
  })

  it('ignores answers from another window, for another prompt or with an unknown action', () => {
    prompt.show({ id: 4, html: PROMPT_HTML })
    prompt.handlers['smartscreen/answer']({ sender: fakeTopBar().webContents }, 4, 'run')
    prompt.handlers['smartscreen/answer']({ sender: topBar.webContents }, 5, 'run')
    prompt.handlers['smartscreen/answer']({ sender: topBar.webContents }, 4, 'maybe')
    expect(answers).toEqual([])
    expect(prompt.isActive(topBar)).toBe(true)
  })

  it('shows a second prompt once the first one is answered', () => {
    prompt.show({ id: 1, html: PROMPT_HTML })
    prompt.show({ id: 2, html: PROMPT_HTML })
    expect(shownPayloads().map((p) => p.id)).toEqual([1])
    prompt.handlers['smartscreen/answer']({ sender: topBar.webContents }, 1, 'norun')
    vi.advanceTimersByTime(300)
    expect(shownPayloads().map((p) => p.id)).toEqual([1, 2])
  })

  it('declines a prompt when no topbar can show it', () => {
    prompt.setShells(new Map())
    prompt.show({ id: 9, html: PROMPT_HTML })
    expect(answers).toEqual([[9, 'norun']])
  })

  it('declines every waiting prompt on shutdown', () => {
    prompt.show({ id: 1, html: PROMPT_HTML })
    prompt.show({ id: 2, html: PROMPT_HTML })
    prompt.declineAll()
    expect(answers).toEqual([[2, 'norun'], [1, 'norun']])
  })
})
