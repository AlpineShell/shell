# Google Calendar setup

The hover calendar (Settings → Personalization → Calendar) needs a Google OAuth
**Desktop app** client. Alpine Shell only requests **read-only** access to your
Calendar and Tasks. Tokens are stored encrypted (Electron `safeStorage`) in the
app's `userData` folder and never leave your machine.

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → Library** → enable both:
   - **Google Calendar API**
   - **Google Tasks API**

## 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen** → User type **External** → create.
2. Fill in the app name and your email; save.
3. **Scopes**: you can leave the default; the app requests
   `calendar.readonly` and `tasks.readonly` at sign-in.
4. **Test users**: add your own Google account. While the app is in *Testing*
   mode only listed test users can sign in — that's fine for personal use.

## 3. Create the Desktop OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Desktop app**. Name it (e.g. "Alpine Shell").
3. Copy the **Client ID** and **Client secret**.

No redirect URI setup is needed — desktop clients use a loopback address
(`http://127.0.0.1:<random-port>`) that Google allows automatically.

## 4. Add the credentials to Alpine Shell

Either:

- **In the app**: Settings → Personalization → Calendar → paste the Client ID and
  secret, **Save credentials**, then **Connect Google Calendar**. A browser tab
  opens for consent; after approving you can close it.

- **Or via environment variables** (useful for development), set before launch:

  ```
  ALPINE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
  ALPINE_GOOGLE_CLIENT_SECRET=GOCSPX-…
  ```

  Environment variables take precedence over credentials saved in the app.

## Notes

- The clock's calendar flyout only appears once you're connected.
- Data refreshes automatically (every few minutes and whenever you open the
  flyout). Google Tasks appear on their due date next to all-day events.
- **Disconnect** clears the stored token but keeps your saved Client ID/secret so
  reconnecting is one click.
