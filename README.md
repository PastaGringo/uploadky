# uploadky

**Send a file. Keep it yours.**

Drop a file, get a link, share it. The difference: the file never touches our
servers. It goes straight to **your own [Pubky](https://pubky.org) homeserver**,
and the link points there. We hold no copy, and we can't.

MIT licensed

<!-- Screenshots: landing page, download page, mobile. -->

---

## How it works

| | |
|---|---|
| **Sign in** | Pubky Ring. No account here, no password, no email. |
| **Storage** | Your homeserver. uploadky is granted one folder and reaches nothing else. |
| **Sharing** | `/pub/` is world-readable, so anyone with the link can open it — no account needed. |
| **Leaving** | Your identity is a key, not a row in a database. Change homeserver and your files follow. |

### Two capabilities, and no more

```
/pub/uploadky.app/       its own folder, where your files go
/pub/pubky.app/posts/    only used when you press "Share on pubky.app"
```

The second is deliberately scoped to `posts/` rather than `pubky.app/`, so
uploadky can never touch your profile, follows, tags or bookmarks. Both are
revocable from Pubky Ring at any time.

### Storage layout

```
/pub/uploadky.app/files/<id>        the raw bytes
/pub/uploadky.app/meta/<id>.json    original name, MIME type, size, date
```

The sidecar exists because the homeserver stores bytes and nothing else:
`putBytes` carries neither a filename nor a content type. Without it, a
download would arrive named after an opaque id.

---

## Share links

```
https://<your instance>/<user-key>/<file-id>
```

This opens a **page** showing the file's name, size and date, with a download
button — not the raw bytes. A visitor sees what they are about to get.

`\/raw/<user-key>/<file-id>` still 302-redirects straight to the bytes, for
embedding and for clients without JavaScript.

Either way the server carries **no file bytes**: the browser fetches from the
homeserver directly.

> **Why `?pubky-host=` and not `/storage/<key>/…`**
>
> The official homeserver has not migrated to path addressing:
> `/storage/<key>/pub/…` answers **HTTP 500** (`Can't extract PubkyHost`). The
> query-parameter form is the only one a browser can open without setting a
> custom header.
>
> Measured 2026-09-05 against `homeserver.pubky.app`: real user → `200`,
> unknown key → `404`, missing file → `404`.
>
> Upstream commits to a one-year minimum notice before removing the legacy
> form, so this is not urgent — and the URL is built in a single function, so
> switching is a one-line change.

---

## Authentication: two wire formats

The SDK can produce two authorization URLs, and Pubky Ring builds differ in
what they accept.

| Format | URL | Status in the field |
|---|---|---|
| grant | `pubkyauth://signin_grant?…&cid=…&cpk=…` | **Rejected** by shipping Pubky Ring |
| cookie | `pubkyauth://signin?relay=…&caps=…&secret=…` | Works |

Measured against a real Ring: the `signin_grant` QR is refused with
*"Unrecognized format. Expected a recovery phrase, invite code, auth URL, or
session request."*

**The trap is that this failure is invisible to the app** — it happens on the
phone, no error reaches the page, and a first-time user just sees a QR code
that does nothing. Hence `cookie` as the default, and a switch under the QR
that says so in plain words.

Flip it back once Ring ships grant support: it is the better model
(non-extractable delegated key, revocable, scoped per app).

### Sessions do not survive a reload

`BrowserSessionStore` accepts **grant-backed sessions only**, so a cookie
session cannot be stored in it.

The easy workaround would be writing `session.export()` into `localStorage` —
but that is a **bearer secret**, readable by any XSS, which is precisely what
the grant model exists to prevent. So it is not done. On the legacy protocol
the session lives for the page's lifetime, and the app says so.

---

## Deploying

Settings are baked at build time from `VITE_*`. There was a `/config.json`
fetched before the first render, so one image could serve any environment; it
was dropped, because it blocked first paint on a round-trip for values that
never change.

Only `VITE_HOMESERVER_HTTP_BASE` really varies, and only for someone running
their own homeserver.

```bash
cp .env.example .env   # then adjust
docker compose up -d --build
```

**No domain is baked in.** Leave `VITE_SHARE_BASE` empty and the app uses its
own origin for share links, which is always correct — it serves the share page
itself.

### The server

`server/index.ts` does two things and no more:

| Route | Purpose |
|---|---|
| `GET /raw/<key>/<id>` | **302** to the file on the homeserver |
| everything else | The built app |

> **Security note.** The key is validated against the 52-character z-base32
> alphabet before any `Location` is built. Without that check,
> `/raw/<anything>/<anything>` would make this an **open redirect** usable for
> phishing from your own domain. Verified: a valid key returns `302`,
> `evil.example.com` returns `404`.

---

## Known limits

- **100 MB per file.** A homeserver ceiling, measured in its storage router
  (`DefaultBodyLimit::max(100 * 1024 * 1024)`). Chunking is not implemented; a
  larger file is refused with a clear message rather than a raw `413`.
- **Files are public.** Anyone with the link can read them. The link is
  unguessable, but it is not a password. There is no per-file password:
  anything short of encrypting in the browser would be theatre, since the
  direct homeserver URL bypasses any check the app could make.
- **Homeserver quota** is set by whoever runs it. Exceeding it returns `507`.
- **One homeserver domain per instance.** `homeserverHttpBase` is a single
  setting; a user hosted elsewhere would get a wrong link. Resolving the ICANN
  domain from the pkarr record is not exposed by the JS SDK.
- **No anonymous upload yet.** A Pubky identity is required, which is real
  friction compared with the file-sending sites people already use.

---

## Development

```bash
bun install
bun run dev
```

`bun run build` runs `tsc` then bundles. The typecheck was exercised with a
deliberate error before being trusted: it reports two errors with the probe in
place and none without. A check that has never been seen to fail proves
nothing.

Derived from
[`pubky-app-templates/basic-pubky-app`](https://github.com/pubky/pubky-app-templates).
