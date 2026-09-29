# Storage: Railway/MinIO

Alpine Shell's release artifacts (installers, `latest.yml`) and plugin marketplace bundles are stored
in an S3-compatible object store. That store is a Railway MinIO service, for both the installer
auto-update channel and the plugin marketplace. (Cloudflare R2 was the previous store and has been
decommissioned.) Pointing at a different S3-compatible bucket is **no code change**, only env/config.

Both upload scripts source their S3 client from `apps/desktop/scripts/storage.js`:

- `scripts/publish.js`: installer + `latest.yml` upload (auto-update channel).
- `scripts/publishPlugin.js`: plugin bundle + catalog upload (marketplace).

## Env vars

`storage.js` reads the generic `STORAGE_*` vars.

| Var | Notes |
|---|---|
| `STORAGE_ENDPOINT` | Full S3 API base URL. |
| `STORAGE_REGION` | Optional. Defaults to `us-east-1`. |
| `STORAGE_ACCESS_KEY_ID` | Access key with read+write on the bucket. |
| `STORAGE_SECRET_ACCESS_KEY` | Secret key. |
| `STORAGE_BUCKET` | e.g. `alpine-plugins`. |
| `STORAGE_FORCE_PATH_STYLE` | Path-style addressing. Defaults to `true` (MinIO requires it). |
| `STORAGE_PUBLIC_URL` | Public read base URL (trailing slash added if missing). Used to derive the client-facing base. |

## Pointing at a bucket is config, not code

Both upload scripts read their S3 credentials from the `STORAGE_*` env, so moving to a different
S3-compatible bucket is env/config only: no `@aws-sdk/client-s3` change and no rewrite of the
upload/list/prune logic. Two client-facing read bases select which bucket installed apps and the
marketplace read from:

- `electron/pluginMarketplaceContract.js → MARKETPLACE_BASE_URL`: the marketplace catalog + bundle
  read base (owned by the marketplace subsystem). Catalog `url`/`iconUrl` values are **relative keys**
  resolved against this base, so no catalog data needs rewriting.
- `apps/desktop/package.json → build.publish.url`: the installer auto-update channel baked into each
  build. It points at the auth service's `/releases/` feed, which answers `latest.yml` and the
  installer files only to a valid licence token (sent by the updater as a bearer header) and redirects
  to a short-lived presigned URL on the Railway bucket. The bucket itself is where `publish.js` writes.

## What the USER must provision on Railway (NOT code)

1. **MinIO service.** Use Railway's MinIO template (or any S3-compatible bucket service). Note the API
   endpoint (internal `http://minio.railway.internal:9000` for in-project CI, or the generated public
   domain `https://<minio-service>.up.railway.app` externally) and the console credentials.
2. **Create the bucket** matching `STORAGE_BUCKET` (e.g. `alpine-plugins`).
3. **Enable public read** on the plugin prefix. The desktop client fetches bundles and the catalog
   **unauthenticated**. Grant an anonymous download policy on `plugins/*`:
   - MinIO: `mc anonymous set download myminio/alpine-plugins`
   - or a bucket policy granting `s3:GetObject` to `*` on `arn:aws:s3:::alpine-plugins/plugins/*`.
4. **Credentials.** Create an access key/secret pair with read+write on the bucket and set them as the
   `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` secrets (GitHub Actions + local). Publishing
   is authenticated; reading is anonymous.
5. **CORS.** Allow `GET, HEAD` from `*` (or the `apps/web` origin + the desktop `net.fetch` null
   origin) on the `plugins/*` prefix so the web listing icons and the desktop downloader can fetch.
   Set via `mc` / the MinIO config, a console/CLI step, not code.
6. **Persistent volume** attached to the MinIO service (the Railway MinIO template includes one) so
   objects survive redeploys.
7. **Set `STORAGE_PUBLIC_URL`** to the bucket's public read base (with trailing slash), and flip
   `MARKETPLACE_BASE_URL` to the same value.

## Set the Railway env (example)

```
STORAGE_ENDPOINT=https://<minio-service>.up.railway.app
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=<minio-access-key>
STORAGE_SECRET_ACCESS_KEY=<minio-secret-key>
STORAGE_BUCKET=alpine-plugins
STORAGE_FORCE_PATH_STYLE=true
STORAGE_PUBLIC_URL=https://<minio-service>.up.railway.app/alpine-plugins/
```

## Installer auto-update channel (release CI)

The website marketplace only needs `NEXT_PUBLIC_PLUGINS_BASE`. The **app installer
auto-update** channel is different: the URL an installed app checks is baked into
that build (`build.publish.url`). `.github/workflows/release.yml` is driven by
these GitHub **secrets** and **variables** so you never hardcode the URL:

| GitHub | Name | Purpose |
|---|---|---|
| Secret | `STORAGE_ENDPOINT` | Railway MinIO endpoint. `publish.js` uploads the installer + `latest.yml` here. |
| Secret | `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Railway credentials. |
| Secret | `STORAGE_BUCKET` | Bucket name (installer keys and `plugins/*` can share one bucket). |
| Secret | `STORAGE_FORCE_PATH_STYLE` | `true` for MinIO. |
| Secret | `ALPINE_MARKETPLACE_PUBKEY` | Ed25519 SPKI public key (PEM, escaped one-line PEM or base64 PEM) matching `ALPINE_PLUGIN_SIGNING_KEY`, baked into `electron/marketplacePublicKey.generated.js` so a release build can verify plugin signatures. A release build ignores the run-time environment variable of the same name, refuses to install a bundle whose signature does not verify against it, and the workflow fails when it is unset. |
| Variable | `ALPINE_PLUGINS_BASE` | Optional https base of the plugin catalog, baked into `electron/marketplaceConfig.generated.js`. Unset, a release build uses the built-in default; the workflow fails on a base that is not https. A release build ignores the environment and `.env` for this value. |

The update feed URL is not a variable: `package.json` `build.publish.url` is the only source, the
workflow asserts that the packaged `resources/app-update.yml` carries it, and the old
`UPDATE_PUBLIC_URL` variable is no longer read.
