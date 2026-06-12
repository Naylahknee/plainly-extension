# Plainly on Android (APK / Play Store)

**The honest constraint first:** a Chrome extension cannot be packaged as
an APK. Chrome for Android does not support extensions at all, and Google
Play does not accept extension packages. So "Plainly as an APK" means
shipping a different shape of the same product. There are three realistic
paths, from easiest to most involved:

## Path 1 — Plainly Web (PWA) → APK  ✅ built, in `web/`

This repo now contains **Plainly Web**: a standalone web app that reuses
the exact same glossary engine and AI layer. Instead of injecting into
other sites (impossible on Android), users paste or type confusing text
and get the plain-English breakdown. It's installable as a PWA (offline
glossary included) and can be wrapped into a genuine, Play-Store-ready
APK.

### Steps

1. Build it: `./scripts/build-web.sh` → static site in `dist/web/`
2. Deploy `dist/web/` anywhere with HTTPS (Netlify, Vercel, GitHub Pages).
3. Wrap it into an APK/AAB with one of:
   - **PWABuilder** (easiest): go to https://www.pwabuilder.com, enter your
     deployed URL, download the Android package (a Trusted Web Activity).
   - **Bubblewrap** (CLI): `npx @bubblewrap/cli init --manifest https://YOUR-URL/manifest.webmanifest`
     then `npx @bubblewrap/cli build` → `app-release-signed.apk` + `.aab`.
4. Upload the `.aab` to the [Google Play Console](https://play.google.com/console)
   ($25 one-time developer fee), add the `assetlinks.json` file PWABuilder/
   Bubblewrap gives you to `https://YOUR-URL/.well-known/assetlinks.json`
   (this removes the browser bar), fill in the listing, and submit.

The Play listing can reuse the copy in `LISTING.md` and the privacy policy
in `PRIVACY.md`.

## Path 2 — Extension on Android browsers that support extensions

No APK needed: **Firefox for Android** and **Kiwi/Edge Canary-class
browsers** support extensions on Android. Porting Plainly to Firefox
requires swapping `chrome.sidePanel` for Firefox's `sidebar_action` and
adding a `browser_specific_settings.gecko` id, then publishing on
addons.mozilla.org. Good follow-up project; not started yet.

## Path 3 — Native Android app

A full Android accessibility-service app that overlays translations on
other apps is a separate (large) product. The glossary JSON and prompt
templates here are reusable, but everything else would be new. Only worth
it if Plainly Web proves demand.

**Recommendation:** ship Path 1 now (the work is done), consider Path 2
next, treat Path 3 as future vision.
