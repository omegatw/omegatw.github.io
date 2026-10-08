# Project verification

- Static GitHub Pages site; the meipeanut site is served at https://omegatw.github.io/meipeanut/.
- No configured automated test runner in package.json. Check JavaScript with `node --check meipeanut/script.js` and `node --check client-to-store-mail.mjs`, and whitespace with `git diff --check`.
- client-to-store-mail.mjs is the Cloudflare Worker source; deploy it separately from GitHub Pages. Required bindings: EMAIL, MAIL_IP_LIMITER (3/60 seconds), MAIL_SITE_LIMITER (10/60 seconds). Required secret: TURNSTILE_SECRET_MEIPEANUT.
- Worker tests must mock Email Sending and Turnstile; do not send real emails during automated verification. Live end-to-end testing requires the allowed hostname and explicit approval for sending.
- Rate limiter bindings provide per-location limits, not strict global quotas. All client paths on omegatw.github.io share an origin; paths are not tenant security boundaries.
