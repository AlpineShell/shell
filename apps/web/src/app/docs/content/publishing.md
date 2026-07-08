# Publishing to the marketplace

When your plugin is ready, you pack it into a signed bundle and publish it to the catalog. The desktop app installs from that catalog after a real user click and an in-app consent step — the web marketplace is a shop window, never an installer.

> **Curated today.** Submission is limited to first-party and vetted publishers. Every installable bundle must be signed by the marketplace key; the desktop installer refuses anything that fails the signature check.

## 1. Build and pack

Build your renderer (if you use the SDK + Vite path), then pack the plugin folder into a `.alpineplugin` bundle. Packing is zip-slip- and symlink-safe: `plugin.json` must sit at the archive root, and any symlink or path escaping the plugin folder aborts the pack.

```
alpine plugin build      # emits dist/renderer.js (+ renderer.css)
alpine plugin pack       # emits <id>-<version>.alpineplugin
```

## 2. Sign

Every bundle is signed with **Ed25519**. The signature is computed over the SHA-256 digest of the `.alpineplugin` file — signing the hash, not the whole file, keeps signing cheap and verification a two-step check after the download hash.

The public half of the key is baked into the desktop app; the private half never ships and lives only in the publisher's environment. Publish and verify therefore can never drift — the app installs only what this key signed.

## 3. Publish

The publish script uploads three things to the object store and rolls up the catalog:

- the immutable versioned bundle at `plugins/<id>/<version>/<id>-<version>.alpineplugin`,
- a per-plugin `plugins/<id>/latest.json` pointer with the `sha256`, `signature`, `size`, `url` and `engines`,
- an upserted entry in the rolled-up `plugins/index.json` catalog.

```
bun run publish:plugin <pluginDir>
```

This needs the Ed25519 signing key and the storage credentials in the environment. See `RELEASING.md` for the exact variables and the provisioning checklist.

## 4. The catalog shape

The web marketplace and the desktop installer read the **same** JSON. `index.json` is the rolled-up listing; `latest.json` is the per-plugin pointer with integrity fields. URLs in the catalog are **relative keys** resolved against the store's public base URL, so moving the bucket is a one-line base-URL change with no catalog rewrite.

The marketplace adds presentational fields on top of the installer's integrity fields: `shortDescription`, `category`, `icon`, `screenshots`, the `readme` markdown string, and an optional `permissionReasons` map that becomes the per-permission "Why:" lines on your plugin's detail page.

## 5. The install deep link

Each plugin page has an **Install in Alpine Shell** button. It is a plain link:

```
alpine-shell://install-plugin?id=<id>&version=<version>
```

The desktop app registers this protocol. Clicking it **focuses the Settings marketplace detail page** for that plugin — it never auto-installs. The actual download, hash check, signature verification and consent all happen inside the app, driven by a real user click on the settings detail page. A drive-by web page can at most open the detail page; it can never trigger an install.

## A note on supply-chain honesty

Signing proves a bundle came from the marketplace key and wasn't tampered with in transit. It does **not** prove the plugin's code is safe — a signed plugin still runs in-process today (Tier A). That is why the catalog is a single-writer, human-curated trust root and why only first-party and vetted publishers are listed until the untrusted sandbox (Tier B) lands. Treat the signature as *integrity + provenance*, not *safety*.
