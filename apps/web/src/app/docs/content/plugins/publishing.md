# Publishing your plugin

A working plugin reaches other people in two ways: share the folder directly, or ship it through the marketplace.

## Share the folder

A plugin *is* its folder, so distributing one is distributing that folder:

1. Zip the plugin folder (the one with `plugin.json` at its root).
2. Share it however you like: a GitHub repo, a release asset, a direct download.
3. The recipient unzips it into their plugins folder (**Settings → Plugins → Open plugins folder**) and clicks **Reload**.

No registry entry, no review queue; the folder is the package. Publish the source alongside it so people can see what they're installing.

## The marketplace

The in-app marketplace (**Settings → Plugins → Browse**) and the plugin pages on the website list plugins from the curated catalog. These install with one click:

- In the app, **Browse → Install** downloads and installs the plugin directly.
- On the website, each plugin page has an **Install in Alpine Shell** button, a deep link:

  ```
  alpine-shell://install-plugin?id=<id>&version=<version>
  ```

  Clicking it opens Alpine Shell, switches to **Plugins → Browse**, and installs that plugin from the catalog. The link only resolves for ids that exist in the catalog, so a web page can trigger an install of a listed plugin, never of arbitrary code.

### Getting listed

The catalog is curated by the Alpine Shell team today; open submission is on the roadmap. If you'd like your plugin considered, get in touch with a link to the source.

A catalog entry needs the manifest fields that are optional locally:

- `id` set explicitly (reverse-DNS, equal to the folder name) and `version` as real semver; the marketplace keys installs and updates on both.
- A filled `marketplace` block: `shortDescription`, `category`, a `readme`, and ideally `screenshots` and a `logo`. See the [manifest reference](/docs/plugins/manifest).

Until your plugin is listed, share the folder; it's the same plugin either way.
