const CALLBACK_RETRY_DELAYS_MS = [1000, 3000, 9000]
const CALLBACK_TIMEOUT_MS = 15000

function waitFor(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isRetryableStatus(status) {
  return status >= 500 || status === 408 || status === 429
}

async function sendOnce(url, token, payload, fetchImpl) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
  })
  return { ok: response.ok, retryable: isRetryableStatus(response.status), problem: `it answered ${response.status}` }
}

async function attemptCallback(url, token, payload, fetchImpl) {
  try {
    return await sendOnce(url, token, payload, fetchImpl)
  } catch (error) {
    return { ok: false, retryable: true, problem: error.message }
  }
}

async function postCallback(url, payload, { fetch: fetchImpl = globalThis.fetch, sleep = waitFor, env = process.env } = {}) {
  const token = env.PLUGIN_BUILD_CALLBACK_TOKEN
  if (!token) throw new Error('PLUGIN_BUILD_CALLBACK_TOKEN is not set, so the result could not be reported')
  let result = await attemptCallback(url, token, payload, fetchImpl)
  for (const delay of CALLBACK_RETRY_DELAYS_MS) {
    if (result.ok || !result.retryable) break
    await sleep(delay)
    result = await attemptCallback(url, token, payload, fetchImpl)
  }
  if (!result.ok) throw new Error(`Could not report to ${url}: ${result.problem}`)
}

async function reportFailure(url, payload, deps) {
  try {
    await postCallback(url, payload, deps)
  } catch (error) {
    console.error(error.message)
  }
}

module.exports = { CALLBACK_RETRY_DELAYS_MS, postCallback, reportFailure }
