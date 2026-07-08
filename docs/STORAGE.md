# Storage: R2 → Railway/MinIO Migration

Alpine Shell's release artifacts (installers, `latest.yml`) and plugin marketplace bundles are stored
in an S3-compatible object store. Today that is Cloudflare R2; the code is ready to point at a Railway
MinIO service (or any S3-compatible bucket) with **no code change** — only env/config.

Both upload scripts source their S3 client from `apps/desktop/scripts/storage.js`:

- `scripts/publish.js` — installer + `latest.yml` upload (auto-update channel).
- `scripts/publishPlugin.js` — plugin bundle + catalog upload (marketplace).

## Env vars

`storage.js` reads generic `STORAGE_*` vars and falls back to the legacy `R2_*` vars, so nothing
breaks during the transition. `STORAGE_*` always wins when set.

| Generic (preferred) | Legacy fallback | Notes |
|---|---|---|
| `STORAGE_ENDPOINT` | derived from `R2_ACCOUNT_ID` (`https://<id>.r2.cloudflarestorage.com`) | Full S3 API base URL. |
| `STORAGE_REGION` | — (was hardcoded `auto`) | Defaults to `auto` for R2 endpoints, `us-east-1` otherwise. |
| `STORAGE_ACCESS_KEY_ID` | `R2_ACCESS_KEY_ID` | Access key with read+write on the bucket. |
| `STORAGE_SECRET_ACCESS_KEY` | `R2_SECRET_ACCESS_KEY` | Secret key. |
| `STORAGE_BUCKET` | `R2_BUCKET` | e.g. `alpine-plugins`. |
| `STORAGE_FORCE_PATH_STYLE` | — | `true` for MinIO/Railway. Auto-enabled when `STORAGE_ENDPOINT` is a non-R2 host. |
| `STORAGE_PUBLIC_URL` | — | Public read base URL (trailing slash added if missing). Used to derive the client-facing base. |

`forcePathStyle` is set automatically to `true` when `STORAGE_ENDPOINT` is present and is **not** an
`*.r2.cloudflarestorage.com` host (MinIO requires path-style addressing), or whenever
`STORAGE_FORCE_PATH_STYLE=true` is set explicitly. R2 works with either style.

## The migration is a config change, not a code change

Both Cloudflare R2 and a Railway MinIO service speak the S3 API. The only deltas to move plugin
hosting from R2 to Railway are:

1. Set the `STORAGE_*` env/secrets to the Railway MinIO values (below).
2. Flip the client-facing public read base:
   - `electron/pluginMarketplaceContract.js → MARKETPLACE_BASE_URL` — the marketplace catalog + bundle
     read base (owned by the marketplace subsystem). Catalog `url`/`iconUrl` values are **relative
     keys** resolved against this base, so no catalog data needs rewriting.
   - `apps/desktop/package.json → build.publish.url` — **only** if you also migrate the installer
     auto-update channel. Recommended: keep installer updates on R2 (proven) and migrate only the
     plugin marketplace to Railway; scope the env per CI step so `publish.js` reads R2 and
     `publishPlugin.js` reads Railway.

No `@aws-sdk/client-s3` change and no rewrite of the upload/list/prune logic.

## What the USER must provision on Railway (NOT code)

1. **MinIO service.** Use Railway's MinIO template (or any S3-compatible bucket service). Note the API
   endpoint — internal `http://minio.railway.internal:9000` for in-project CI, or the generated public
   domain `https://<minio-service>.up.railway.app` externally — and the console credentials.
2. **Create the bucket** matching `STORAGE_BUCKET` (e.g. `alpine-plugins`).
3. **Enable public read** on the plugin prefix. The desktop client fetches bundles and the catalog
   **unauthenticated** (exactly like the R2 `pub-*.r2.dev` URL). Grant an anonymous download policy on
   `plugins/*`:
   - MinIO: `mc anonymous set download myminio/alpine-plugins`
   - or a bucket policy granting `s3:GetObject` to `*` on `arn:aws:s3:::alpine-plugins/plugins/*`.
4. **Credentials.** Create an access key/secret pair with read+write on the bucket and set them as the
   `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` secrets (GitHub Actions + local). Publishing
   is authenticated; reading is anonymous.
5. **CORS.** Allow `GET, HEAD` from `*` (or the `apps/web` origin + the desktop `net.fetch` null
   origin) on the `plugins/*` prefix so the web listing icons and the desktop downloader can fetch.
   Set via `mc` / the MinIO config — a console/CLI step, not code.
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

## Migrating existing objects (one-time, optional)

If plugin objects already live in R2:

```sh
rclone copy r2:alpine-plugins/plugins railway:alpine-plugins/plugins
```

(or `aws s3 sync` with two endpoint profiles). Pure ops, no code. For a first marketplace launch there
is nothing to migrate.
