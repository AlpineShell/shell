async function readCappedBody(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!res.body) return Buffer.alloc(0)
  const chunks = []
  let total = 0
  for await (const chunk of res.body) {
    total += chunk.length
    if (total > maxBytes) return null
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

module.exports = { readCappedBody }
