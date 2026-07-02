# Google Calendar setup

The hover calendar (Settings → Personalization → Calendar) needs a Google OAuth
**Desktop app** client. Alpine Shell only requests **read-only** access to your
Calendar and Tasks. Tokens are stored encrypted (Electron `safeStorage`) in the
app's `userData` folder and never leave your machine.

There are two ways to supply the OAuth client:

- **Ship one shared client** (recommended for a released build) — you bake a
  single Desktop client into the installer via `.env`, and users just click
  **Connect**. See _For maintainers_ below.
- **Bring your own client** — each user creates their own Google Cloud project
  and pastes the Client ID/secret in Settings. See _Advanced_ below.

---

## For maintainers: bake one shared client (`.env`)

You create **one** Google Cloud project + Desktop OAuth client and ship it, so
end users never touch Google Cloud.

### 1. Create the Google Cloud project

1. Open <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → Library** → enable **both** (each is a separate API — a
   missing one shows up as an empty calendar):
   - **Google Calendar API**
   - **Google Tasks API**

### 2. Configure the consent screen (Google Auth Platform)

The old single "OAuth consent screen" page is now **APIs & Services → Google Auth
Platform**, split into **Branding / Audience / Data Access / Clients**.

1. **Branding**: app name, support email, developer contact.
2. **Audience**: User type **External**. Add yourself under **Test users** while
   testing.
3. **Data Access**: the app requests `calendar.readonly` and `tasks.readonly` at
   sign-in; you don't need to pre-add them, but they must be allowed.

### 3. Create the Desktop OAuth client

1. **Clients → Create client → Application type: Desktop app**.
2. Copy the **Client ID** and **Client secret**. No redirect URI setup is needed
   — desktop clients use a loopback address (`http://127.0.0.1:<random-port>`).

### 4. Put the credentials in `.env`

Copy `.env.example` to `apps/desktop/.env` and fill in:

```
ALPINE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
ALPINE_GOOGLE_CLIENT_SECRET=GOCSPX-…
```

`bun start app`, `bun run build`, and `bun run release` each regenerate
`electron/modules/googleCredentials.generated.js` from `.env` and bake it into
the app. Precedence at runtime: `ALPINE_GOOGLE_*` env vars → user-pasted
credentials → the baked client.

### 5. Releasing via CI

The generator reads `ALPINE_GOOGLE_CLIENT_ID` / `ALPINE_GOOGLE_CLIENT_SECRET`
from the environment **before** `.env`, so CI never needs the (gitignored)
`.env` file. In GitHub → **Settings → Secrets and variables → Actions**, add
both as repository secrets; `release.yml` passes them into the "Build and
publish to R2" step alongside the `R2_*` secrets. The secret lives only in
GitHub's encrypted store and the shipped installer — never in git.

### Is it safe to ship the secret? Yes.

A Google **Desktop app** client is a *public client* — Google's docs assume
installed apps "cannot keep secrets." The Client ID/secret ship inside every
installer by design; **PKCE** (already implemented) is what actually secures
sign-in. `.env` and `googleCredentials.generated.js` are **gitignored** — keep
the real values in your build machine / CI secrets, because Google's scanners
auto-reset client secrets committed to public repos. Never put a *web-app*
client secret, service-account key, or API key here — those are real secrets.

### Before wide distribution: publish + verify

While the app is **External + Testing**: max 100 test users, an "unverified app"
warning, and — the big one — **refresh tokens expire after 7 days**, forcing
weekly re-login. To fix all three, set **Audience → Publishing status →
Production** and complete Google's **sensitive-scope verification** (Calendar
read is "sensitive": needs a homepage, privacy policy, and a demo video; ~up to
10 days; no CASA audit required).

---

## For end users

If the build already ships a client, you don't need Google Cloud at all:

1. **Settings → Personalization → Calendar → Connect Google Calendar**.
2. A browser tab opens for consent; approve, then close the tab.
3. The clock's calendar flyout appears once you're connected.

---

## Advanced: bring your own client

Prefer your own credentials? Do steps 1–3 above for your own project, then in
**Settings → Personalization → Calendar** paste the Client ID and secret, **Save
credentials**, then **Connect Google Calendar**. Pasted credentials override the
baked client.

---

## Notes

- Data refreshes automatically (every few minutes and whenever you open the
  flyout). Google Tasks appear on their due date next to all-day events.
- Calendar and Tasks are fetched independently — if one API is disabled or
  errors, the other still shows, and the failure is logged as
  `[googleCalendar] refresh partial failure: …`.
- **Disconnect** clears the stored token but keeps saved credentials so
  reconnecting is one click.
