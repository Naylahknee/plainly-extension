# Auto-publishing Plainly (one-time setup)

Once this is set up, publishing a new version is just: bump the version,
push a tag, done — GitHub uploads it to the Chrome Web Store for you.

This is a **one-time** setup. It's fiddly but you only do it once. Every step
is in a web browser — nothing to install. Take your time.

You'll end up with **four secret values** that you paste into GitHub:

| Secret name in GitHub | What it is |
|---|---|
| `CHROME_EXTENSION_ID` | Plainly's ID in the store |
| `CHROME_CLIENT_ID` | an API "client" id |
| `CHROME_CLIENT_SECRET` | its matching secret |
| `CHROME_REFRESH_TOKEN` | a long-lived permission token |

> **Prerequisite:** you must have already done the first manual submission
> (see `SUBMIT.md`) so the item exists. You do **not** have to wait for it to
> be approved — as soon as the item is created, it has an ID.

---

## Part A — Get the Extension ID

1. Open your **Developer Dashboard**:
   https://chrome.google.com/webstore/devconsole
2. Click the Plainly item.
3. Look at the address bar. The long string of letters in the URL is your
   **Extension ID** — something like `abcdefghijklmnopabcdefghijklmnop`.
4. Copy it. That's `CHROME_EXTENSION_ID`.

---

## Part B — Turn on the API (Google Cloud, free)

1. Go to https://console.cloud.google.com and sign in with the **same Google
   account** you used for the developer dashboard.
2. At the top, click the project dropdown → **New Project**. Name it
   `plainly-publish` and create it. Make sure it's selected afterward.
3. In the top search bar, type **Chrome Web Store API**, open it, and click
   **Enable**.

---

## Part C — Create the OAuth credentials

1. In the search bar, go to **APIs & Services → OAuth consent screen**.
   - User type: **External** → Create.
   - App name: `plainly-publish`. Fill your email where required. Save.
   - On the **Audience** (or "Test users") screen, click **Add users** and
     add your **own Google email**. Save. (Leaving it in "Testing" is fine.)
2. Go to **APIs & Services → Credentials → + Create credentials → OAuth
   client ID**.
   - Application type: **Web application**.
   - Name: `plainly-publish`.
   - Under **Authorized redirect URIs**, click **Add URI** and paste exactly:
     `https://developers.google.com/oauthplayground`
   - Click **Create**.
3. A box shows your **Client ID** and **Client secret**. Copy both.
   - Client ID → `CHROME_CLIENT_ID`
   - Client secret → `CHROME_CLIENT_SECRET`

---

## Part D — Get the refresh token (OAuth Playground)

1. Open https://developers.google.com/oauthplayground
2. Click the **gear icon** (top right) →
   - Check **Use your own OAuth credentials**.
   - Paste your **Client ID** and **Client secret** from Part C. Close the gear.
3. On the left, in the **"Input your own scopes"** box, paste exactly:
   `https://www.googleapis.com/auth/chromewebstore`
   then click **Authorize APIs**.
4. Sign in with your Google account and click **Allow**. (If it warns the app
   is unverified, choose **Advanced → go to plainly-publish** — it's your own
   app.)
5. You land back on the Playground on **Step 2**. Click **Exchange
   authorization code for tokens**.
6. In the response, copy the value of **`refresh_token`** (a long string
   starting with `1//`). That's `CHROME_REFRESH_TOKEN`.

> If you don't see a `refresh_token`, revoke access at
> https://myaccount.google.com/permissions and repeat Part D — Google only
> returns it on the first authorization.

---

## Part E — Put the four secrets in GitHub

1. Go to the repo on GitHub → **Settings** → **Secrets and variables** →
   **Actions**.
2. Click **New repository secret** and add each one (name must match exactly):
   - `CHROME_EXTENSION_ID`
   - `CHROME_CLIENT_ID`
   - `CHROME_CLIENT_SECRET`
   - `CHROME_REFRESH_TOKEN`

That's the setup done — forever.

---

## Publishing a new version (the easy part, every time)

1. Edit `manifest.json` and bump `"version"` (e.g. `0.4.0` → `0.4.1`).
   Chrome rejects a re-used version number.
2. Commit, then create and push a matching tag:
   ```sh
   git commit -am "Release 0.4.1"
   git tag v0.4.1
   git push && git push --tags
   ```
3. GitHub Actions builds the zip and submits it. Watch it under the repo's
   **Actions** tab. You'll still get the store's approval email as usual.

Prefer a button over tags? Go to **Actions → Publish to Chrome Web Store →
Run workflow**. You can untick "Also submit for review" to upload a draft
only.

---

## If the Action fails

- **`401`/`invalid_grant`** → the refresh token expired or was revoked. Redo
  Part D and update `CHROME_REFRESH_TOKEN`.
- **`Version number is the same`** → you forgot to bump `manifest.json`.
- **`item not found`** → `CHROME_EXTENSION_ID` is wrong; recheck Part A.

Paste the red error text from the Actions log and it's usually a one-line fix.
