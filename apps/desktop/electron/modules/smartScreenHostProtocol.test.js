import { describe, it, expect } from 'vitest'
import protocol from './smartScreenHostProtocol.js'

const { parseHostLine, answerLine, readPromptDetails } = protocol

const BLOCKED_PROMPT = `<!DOCTYPE html>
<html lang="en-GB">
  <body>
    <div id="bodyWrapper" tabindex="1">
      <div class="main-title" id="messageTitle">Windows protected your PC</div>
      <div class="main-desc" id="messageBody">Microsoft Defender SmartScreen prevented an unrecognised app from starting. Running this app might put your PC at risk.</div>
      <div id="moreBtnContainer">
        <a id="moreBtn" href="#" onclick="display_more();">More info</a>
      </div>
      <div id="moreInfoContainer">
        <table id="moreInfoTable">
          <tr>
            <td>
              Application:
            </td>
            <td class="wrappingContent">
               probe.exe
            </td>
          </tr>
          <tr>
            <td>
              Publisher:&nbsp;
            </td>
            <td class="wrappingContent" id="publisher">
              Unknown publisher
            </td>
          </tr>
        </table>
      </div>
    </div>
    <div class="user-actions-section">
      <button class="action dontRunInput" id="dontRunBtn" onclick="dontRun()">Don't run</button>
    </div>
    <script>
      var publisher = "@@PublisherName@@";
    </script>
  </body>
</html>`

const RUNNABLE_PROMPT = BLOCKED_PROMPT
  .replace('<button class="action dontRunInput"', '<button class="action" id="runAnywayBtn" onclick="runApp()">Run anyway</button>\n      <button class="action dontRunInput"')
  .replace('var publisher = "@@PublisherName@@"', 'var publisher = "Contoso &amp; Partners"')

function promptLine(id, html) {
  return `prompt ${id} ${Buffer.from(html, 'utf8').toString('base64')}`
}

describe('parseHostLine', () => {
  it('reads the ready and failed lines', () => {
    expect(parseHostLine('ready')).toEqual({ type: 'ready' })
    expect(parseHostLine('failed 80040154\r')).toEqual({ type: 'failed', code: '80040154' })
  })

  it('decodes the prompt html from base64', () => {
    expect(parseHostLine(promptLine(7, BLOCKED_PROMPT))).toEqual({ type: 'prompt', id: 7, html: BLOCKED_PROMPT })
  })

  it('keeps text outside ASCII in the prompt html', () => {
    const html = '<div id="messageTitle">Windows hat Ihren PC geschützt</div>'
    expect(parseHostLine(promptLine(1, html)).html).toBe(html)
  })

  it('ignores lines it does not know', () => {
    expect(parseHostLine('')).toBeNull()
    expect(parseHostLine('prompt x abc')).toBeNull()
    expect(parseHostLine('prompt 3')).toBeNull()
    expect(parseHostLine('hello there')).toBeNull()
  })
})

describe('answerLine', () => {
  it('writes the answer the host expects', () => {
    expect(answerLine(3, 'run')).toBe('answer 3 run\n')
    expect(answerLine(3, 'norun')).toBe('answer 3 norun\n')
  })

  it('refuses an unknown action or id', () => {
    expect(answerLine(3, 'cancel')).toBeNull()
    expect(answerLine(0, 'run')).toBeNull()
    expect(answerLine('3', 'run')).toBeNull()
  })
})

describe('readPromptDetails', () => {
  it('reads the title, message and details of a prompt without a run button', () => {
    expect(readPromptDetails(BLOCKED_PROMPT)).toEqual({
      title: 'Windows protected your PC',
      message: 'Microsoft Defender SmartScreen prevented an unrecognised app from starting. Running this app might put your PC at risk.',
      details: [
        { label: 'Application', value: 'probe.exe' },
        { label: 'Publisher', value: 'Unknown publisher' },
      ],
      runLabel: '',
      dontRunLabel: "Don't run",
    })
  })

  it('offers the run button and the publisher the script fills in', () => {
    const details = readPromptDetails(RUNNABLE_PROMPT)
    expect(details.runLabel).toBe('Run anyway')
    expect(details.details[1]).toEqual({ label: 'Publisher', value: 'Contoso & Partners' })
  })

  it('returns empty fields for html it cannot read', () => {
    expect(readPromptDetails('<p>nothing here</p>')).toEqual({
      title: '',
      message: '',
      details: [],
      runLabel: '',
      dontRunLabel: '',
    })
  })
})
