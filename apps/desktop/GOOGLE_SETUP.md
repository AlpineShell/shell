# Google Calendar setup

The clock's hover calendar reads Google Calendar + Tasks (read-only). Users just
hit Connect: the browser opens a sign-in page on the Alpine auth service
([AlpineShell/auth](https://github.com/AlpineShell/auth)), and the shell is
connected when Google sends them back. **No Google client id or secret ships in
the installer.**

## How sign-in works

1. `googleCalendar.js` starts a loopback server on `127.0.0.1:<port>` and opens
   `https://auth.alpineshell.com/google-calendar/connect?port&state&code_challenge`.
2. The auth service sends the user to Google with its web client, exchanges the
   code with the client secret, and redirects to the loopback with a sealed,
   two-minute `handoff`.
3. The shell redeems the handoff at `POST /google-calendar/token` with its PKCE
   verifier and stores the refresh token encrypted with `safeStorage`.
4. Access tokens come from `POST /google-calendar/refresh`. A `401` clears the
   session and asks the user to connect again (`session-expired`).

Set `ALPINE_AUTH_BASE` to use a local auth service (`http://localhost:3001`).

## Cloud project

Configured on the auth service's **Web application** client (the one Better Auth
uses for website sign-in):

- **Authorized redirect URIs:** `https://auth.alpineshell.com/google-calendar/callback`
  and `http://localhost:3001/google-calendar/callback`.
- **APIs enabled:** Google Calendar API **and** Google Tasks API. A missing Tasks
  API shows up as `[googleCalendar] refresh partial failure`, not a hard error.
- **Consent screen scopes:** `calendar.readonly` + `tasks.readonly`.

The secret lives only in the auth service's Railway environment
(`GOOGLE_CLIENT_SECRET`).

## Before real distribution

While the consent screen is **External + Testing** there are 100 test users, an
unverified-app warning, and refresh tokens that expire after **7 days**. Publish
to Production and pass sensitive-scope verification (homepage, privacy policy,
demo video) for long-lived tokens. Calendar read is "sensitive", not
"restricted", so no CASA audit is needed.
