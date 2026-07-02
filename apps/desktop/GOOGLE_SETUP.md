# Google Calendar setup

The clock's hover calendar reads Google Calendar + Tasks (read-only) through a
**single shared OAuth "Desktop app" client that we own and ship baked into the
build**. Users just hit Connect — no per-user Google setup.

## Cloud project

Google Cloud Console → our project:

- **APIs enabled:** Google Calendar API **and** Google Tasks API. Both are
  required — a missing Tasks API shows up as `[googleCalendar] refresh partial
  failure`, not a hard error.
- **OAuth client:** type **Desktop app**. The client id + secret are a *public*
  client (PKCE secures sign-in), so baking them into the installer is fine.
- **Consent screen:** External, scopes `calendar.readonly` + `tasks.readonly`.
  (Console nav is now APIs & Services → Google Auth Platform → Branding /
  Audience / Data Access / Clients.)

## Where the credentials live

- **Local dev:** `apps/desktop/.env` (gitignored):

  ```
  ALPINE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
  ALPINE_GOOGLE_CLIENT_SECRET=GOCSPX-…
  ```

- **CI / release:** GitHub → Settings → Secrets and variables → Actions:
  `ALPINE_GOOGLE_CLIENT_ID` + `ALPINE_GOOGLE_CLIENT_SECRET`. `release.yml` passes
  them into `bun run release`.

`scripts/generateGoogleCredentials.js` (runs on dev/build/release) reads env →
`.env` and writes the gitignored `electron/modules/googleCredentials.generated.js`,
which `getCredentials()` uses as the default. Precedence: `ALPINE_GOOGLE_*` env →
creds saved by an older build → baked default. Never commit `.env` or the
generated file — Google auto-resets secrets found in public repos.

## Before real distribution

The consent screen is **External + Testing**: 100 test users, an unverified-app
warning, and refresh tokens that expire after **7 days** (weekly re-login).
Publish to Production and pass sensitive-scope verification (homepage, privacy
policy, demo video) for long-lived tokens. Calendar read is "sensitive", not
"restricted" — no CASA audit needed.
