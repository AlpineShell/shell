# Add a backend

Your renderer runs inside the shell's UI, so it can't read files, keep credentials, or poll APIs with Node. For that, a plugin declares a **backend**: a script the shell runs in its own isolated background process. It starts when the plugin is enabled, stops when it's disabled or uninstalled, and a crash in it can't take down the shell.

Data flows one way: the backend **publishes** onto named channels, and your widgets **subscribe** with `usePluginData`.

## 1. Declare it

Point the manifest's `main` field at a CommonJS file:

```json
{
  "name": "Claude Code Usage",
  "main": "backend.js",
  "contributes": {
    "topbarWidgets": [{ "slot": "left" }]
  }
}
```

## 2. Write `backend.js`

Export a function that receives a context. The common shape is one `ctx.poll` call: fetch something on an interval and publish the result:

```js
module.exports = (ctx) =>
  ctx.poll("claude-usage", fetchUsage, 60_000)

async function fetchUsage() {
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", { headers: authHeaders() })
  if (!res.ok) return null
  return res.json()
}
```

`poll(channel, fn, intervalMs)` runs `fn` immediately and then on the interval, publishing every non-null resolved value on `channel`.

For anything irregular, publish yourself:

| Context member | What it does |
|---|---|
| `ctx.poll(channel, fn, intervalMs)` | Run `fn` now and every `intervalMs`, publish each result on `channel`. |
| `ctx.publish(channel, data)` | Publish a value on a channel right now. |
| `ctx.log(...args)` | Log to the shell's console, prefixed with your plugin id. |

The published value must be serializable (plain objects, arrays, primitives). The shell remembers the latest value per channel, so a widget that mounts later still gets current data.

## 3. Read it in the renderer

`usePluginData(channel, initial)` returns the latest published value and re-renders on every publish:

```js
const { html, usePluginData } = window.alpine

export default function UsageBar() {
  const usage = usePluginData("claude-usage", null)
  if (!usage) return html`<span>-</span>`
  return html`<span>${Math.round(usage.sessionPercent)}%</span>`
}
```

This is exactly how the first-party **Claude Code Usage** plugin works: its backend reads the local Claude Code credentials, polls the usage endpoint once a minute, and publishes on `claude-usage`; the topbar widget is a plain `usePluginData` subscriber.

## What a backend can do

Everything. Backends run **full Node**: filesystem, network, child processes. That's the point, and it's also the caveat: only load plugins whose backend code you wrote, read, or trust.
