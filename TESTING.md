# Manual tests

What cannot be checked from a terminal: anything needing a phone, a real
identity, or a human eye. Automated checks live in the build (`tsc`, then the
bundle); this file is for the rest.

## To test

### Share on pubky.app — never exercised

Added 2026-09-05. This feature has **never written a real post**. The code path
is untested end to end.

- [ ] **Prerequisite**: sign out and scan again. The capabilities changed —
      `/pub/pubky.app/posts/:rw` was added — and an older session does not carry
      it. Signing in again is what grants it.
- [ ] **Where**: the file list, the share icon (three linked dots) on any file.
- [ ] **Step**: press it, keep or edit the message, press *Post*.
- [ ] **Expected**: the sheet closes and the status line says *Posted to
      pubky.app*.
- [ ] **Then**: open pubky.app and look for the post. Nexus indexes it from the
      homeserver's event stream, so allow a few seconds.
- [ ] **If it does not appear**: check whether the write itself failed (an error
      would show) or whether the indexer simply has not caught up. These are
      different problems.

### Homeserver quota — still unknown

- [ ] **Step**: upload files until one is refused.
- [ ] **Expected**: `507 Insufficient Storage`, surfaced as a readable message
      rather than a raw status.
- [ ] **Why it matters**: the quota is set by whoever runs the homeserver, and
      nothing in the app tells the user how much room is left.

### The 100 MB ceiling

- [ ] **Step**: pick a file larger than 100 MB.
- [ ] **Expected**: refused client-side with the size named, never a raw `413`
      from the server.

### Deleting a file

- [ ] **Step**: delete a file, then open its share link again.
- [ ] **Expected**: the download page says *Nothing here* rather than failing.

### Legacy session, on purpose

- [ ] **Step**: sign in, then reload the page.
- [ ] **Expected**: signed out again, and the sign-in message said so beforehand
      (*this session ends when you reload*). This is not a bug: a cookie session
      cannot be stored in `BrowserSessionStore`, and the workaround would mean
      writing a bearer secret into `localStorage`.

### On a real phone

The browser-pane checks used an emulated 375 px viewport. A real device differs
in touch targets, font rendering and the URL bar.

- [ ] **Step**: open the site on a phone.
- [ ] **Expected**: the pitch comes before the QR code, the *Open Pubky Ring*
      button is one line, no horizontal scrolling.
- [ ] **Step**: press *Open Pubky Ring* on the phone itself — the deep link,
      not the QR. Only this proves the mobile path.

## Verified

### Upload and share, end to end — 2026-09-05

- [x] Upload to the official homeserver · 815 136 bytes written
- [x] Public descriptor keeps the original name (`ChatGPT Installer.exe`)
- [x] Anonymous read, no session · `200`, exact byte count
- [x] Share page shows name, size and date without a session
- [x] `/raw/…` redirect followed to completion · `200`, exact byte count
- [x] Download button's cross-origin `fetch` · CORS passes, 1.2 s

### Guards — 2026-09-05

- [x] `/raw/evil.example.com/x` → `404`. Without the z-base32 check this would
      be an open redirect usable for phishing.
- [x] `/../package.json` → the app shell, not the file.
- [x] Unknown key or missing file → `404`, so a `200` actually means something.

### Sign-in — 2026-09-05

- [x] Pubky Ring accepts `pubkyauth://signin` and completes.
- [x] It rejects `pubkyauth://signin_grant` with *Unrecognized format*. The
      failure happens on the phone, so no error reaches the app — hence the
      legacy default and the wording under the QR.
