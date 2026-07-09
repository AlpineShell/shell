# Weather

A tiny example plugin that shows the current temperature in the Alpine Shell topbar,
fetched from the free [Open-Meteo](https://open-meteo.com) API.

It's ~30 lines: a `plugin.json` manifest and an `index.js` that registers one topbar
widget. Use it as a starting point for your own plugin.

## Build your own

See the [Alpine Shell plugin docs](/docs) — the manifest is fully declarative and
the widget is plain React through the host runtime, so a first plugin takes minutes.
