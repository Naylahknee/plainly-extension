# How to submit Plainly to the Chrome Web Store

A plain-English walkthrough. No prior experience needed. Set aside about an
hour for your first submission; after that, updates take minutes.

All the text you'll paste (name, description, permission answers) lives in
[`LISTING.md`](LISTING.md) next to this file. Keep it open in another tab.

---

## What you need before you start

- A **Google account** (a normal Gmail account is fine).
- A **one-time $5 fee** (a credit/debit card) to register as a developer.
  You pay this once, ever — not per extension.
- The **upload file**: `dist/plainly-0.4.0.zip`. If it's not there yet, build
  it — see "Building the zip" at the bottom.

---

## Step 1 — Register as a developer (one time)

1. Go to **https://chrome.google.com/webstore/devconsole**
2. Sign in with your Google account.
3. Accept the developer agreement and pay the **$5** registration fee.
4. You now have a **Developer Dashboard**. This is home base.

---

## Step 2 — Create the item and upload the zip

1. In the dashboard, click **+ New item** (top right).
2. When it asks for a file, upload **`dist/plainly-0.4.0.zip`**.
   - Upload the ZIP itself — do **not** unzip it first.
3. Wait for it to process. It then opens a form with several tabs down the
   left side: **Store listing**, **Privacy practices**, etc. You fill these in.

---

## Step 3 — Fill in "Store listing"

Copy from `LISTING.md`:

- **Name:** Plainly — Plain English for Technical Websites
- **Summary:** the one-line summary from LISTING.md (≤132 characters).
- **Description:** the big block of text under "Detailed description".
- **Category:** Accessibility.
- **Language:** English.
- **Icon:** upload `assets/icon128.png`.
- **Screenshots:** upload the two files from `store/screenshots/`
  (`1-popup-1280x800.png` and `2-sidepanel-1280x800.png`). At least one is
  required.
- **Small promo tile (optional):** `store/screenshots/promo-440x280.png`.

Click **Save draft** as you go.

---

## Step 4 — Fill in "Privacy practices"

This is the most important tab — it's what reviewers check hardest. Answer
truthfully; Plainly genuinely collects nothing.

1. **Single purpose:** paste the single-purpose statement from LISTING.md.
2. **Permission justifications:** for each permission it lists
   (`storage`, `activeTab`, `contextMenus`, `sidePanel`, and **host
   permissions / all sites**), paste the matching justification from the
   "Permission justifications" table in LISTING.md.
   - The **host permissions** one matters most — Plainly asks to run on all
     sites, so the reviewer will look for a clear reason. LISTING.md has the
     wording ready.
3. **Data usage:** check the boxes that say you do **not** collect user data.
   Then check the three certification boxes at the bottom (no selling data,
   no unrelated use, no creditworthiness use).
4. **Privacy policy URL:** paste
   `https://github.com/Naylahknee/plainly-extension/blob/main/PRIVACY.md`

---

## Step 5 — Submit for review

1. Make sure every tab shows a green check (no "issues to resolve").
2. Choose visibility: **Public** (anyone can find it) or **Unlisted** (only
   people with the link). Unlisted is a nice way to test first.
3. Click **Submit for review**.

That's it. You'll get an email when it's approved or if they need changes.

---

## How long does review take?

Because Plainly runs on **all sites**, Google does a **manual review**. That
usually takes **a few days to ~3 weeks**. Extensions on a short, fixed site
list are reviewed faster — but the all-site version is legitimate, and the
justifications in LISTING.md are written to pass it. See the "Note on broad
host permissions" section in LISTING.md if you'd rather trade breadth for a
faster review.

---

## If it gets rejected

Don't panic — it's normal and usually a quick fix. The email names the exact
policy. Most common causes and fixes:

- **"Requesting broad host permissions"** → make sure the host-permission
  justification (Step 4) is filled in and matches the single-purpose
  statement. Re-submit.
- **"Data disclosure mismatch"** → double-check the Privacy practices answers
  say no data collection, consistent with PRIVACY.md.

Fix the one thing they name, click **Submit for review** again. You don't
start over.

---

## Publishing an update later

When you change the code:

1. Bump the `version` in `manifest.json` (e.g. `0.4.0` → `0.4.1`). Chrome
   rejects an upload that reuses a version number.
2. Rebuild: `./scripts/package.sh`
3. In the dashboard, open the Plainly item → **Package** → **Upload new
   package** → pick the new zip → **Submit for review**.

---

## Building the zip

From the project folder, run:

```sh
./scripts/package.sh
```

It creates `dist/plainly-<version>.zip` with only the files the extension
needs (no docs, no git data). That zip is what you upload in Step 2.
