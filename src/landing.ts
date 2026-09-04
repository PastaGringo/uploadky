import { iconExit, iconEye, iconKey, iconLock } from './icons'

/**
 * The pitch, shown beside the sign-in card. Signed out, this page IS the
 * landing page — no separate route, no second bundle to keep in sync.
 *
 * Every line here is short on purpose: the headline does the talking, the
 * points are proof, and nothing asks to be read twice.
 */
export function brandHtml() {
  return `
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="8" stroke="#FFA62B" stroke-width="1.6"/>
        <path d="M16 22V10" stroke="#FFA62B" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M11 15l5-5 5 5" stroke="#FFA62B" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h1>uploadky</h1>
    </div>
  `
}

export function pitchHtml() {
  return `
    <section class="pitch">
      ${brandHtml()}
      <h2>
        <span class="line">Send a file.</span>
        <span class="line">Keep it <em>yours.</em></span>
      </h2>
      <p class="lede">
        It goes straight to your own Pubky homeserver. We never hold a copy —
        the link you share points there, not here.
      </p>

      <ul class="points">
        <li>
          ${iconKey()}
          <span>
            <strong>One folder, nothing else</strong>
            Granted <code>/pub/uploadky.app/</code> only. Revoke it from Ring any time.
          </span>
        </li>
        <li>
          ${iconLock()}
          <span>
            <strong>No account, no password</strong>
            You sign in with keys you already hold.
          </span>
        </li>
        <li>
          ${iconExit()}
          <span>
            <strong>Leave with everything</strong>
            Change homeserver; your files follow your key.
          </span>
        </li>
        <li class="caution">
          ${iconEye()}
          <span>
            <strong>Anyone with the link can read it</strong>
            Public storage, unguessable link — but not a password.
          </span>
        </li>
      </ul>

      <p class="pitch-foot">
        Built on the <a href="https://pubky.org" target="_blank" rel="noopener">Pubky</a> protocol
      </p>
    </section>
  `
}
