# Bundled preset plugins

First-party plugins in this folder are **bundled into the app** (via
electron-builder `extraResources → resources/plugins`) and loaded read-only at
startup, in addition to any the user drops into their plugins folder.

There are none by default — Alpine ships lean and everything comes from the
marketplace. Put a plugin folder here only if it should ship *inside* the installer.
First-party plugins published to the marketplace instead live in
`apps/desktop/official-plugins/`.
