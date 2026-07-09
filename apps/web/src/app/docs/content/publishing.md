# Sharing your plugin

Once your plugin works locally, there are two ways it reaches other people — and they map to the two kinds of plugin. Anyone can distribute a **custom** plugin. Only the Alpine Shell team publishes **official** plugins to the one-click marketplace.

## Custom plugins: share the folder

A custom plugin *is* its folder, so sharing one is just sharing that folder:

1. Zip the plugin folder — the one with `plugin.json` at its root.
2. Send it however you like: a GitHub repo, a release asset, a direct download.
3. The recipient unzips it into their plugins folder (**Settings → Plugins → Open plugins folder**) and clicks **Reload**.

That is the whole distribution story for custom plugins. No signing, no review, no marketplace entry — the folder is the package, and it installs by being dropped in.

> **Custom plugins carry real security risk.** A dropped-in plugin runs in-process with the shell's full privileges — no sandbox and no runtime permission enforcement (Tier A). Installing one means running someone else's program with full access to your session, files and system. Only drop in a plugin whose source you've read or whose author you trust. When you share one, publish the source and state plainly what it does and which permissions it needs, so people can make that call before they install it.

## The marketplace: official plugins only

The in-app marketplace (**Settings → Plugins → Browse**) and the plugin pages on the website list **official, first-party plugins** — built and signed by the Alpine Shell team. These are the only plugins that install with **one click**:

- In the app, **Browse → Install** downloads and installs the plugin directly.
- On the website, each plugin page has an **Install in Alpine Shell** button. It is a deep link:

  ```
  alpine-shell://install-plugin?id=<id>&version=<version>
  ```

  Clicking it opens Alpine Shell, switches to **Plugins → Browse**, and installs that plugin from the catalog. The link only resolves for ids that are actually in the catalog — a web page can trigger an install of an *official* plugin, never of arbitrary code.

> **An open marketplace is planned.** Today the catalog is a single, human-curated set of first-party plugins — third-party submission isn't open yet. An open marketplace where anyone can publish is on the roadmap, gated behind the untrusted sandbox (Tier B) so third-party plugins can run without full trust. Until then, distribute your plugin as a custom folder (above), and get in touch if you'd like it considered for the first-party catalog.
