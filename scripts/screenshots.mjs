/**
 * Capture the README screenshots.
 *
 * Chrome's own `--screenshot` hangs on this site: the sign-in flow long-polls
 * the HTTP relay, so the network never goes idle and Chrome waits forever.
 * Playwright lets us wait for a SELECTOR instead, which is the thing we
 * actually care about, and finishes regardless of pending requests.
 *
 * Uses the Chrome already installed on the machine (`channel: 'chrome'`), so
 * nothing is downloaded.
 *
 *   bun run scripts/screenshots.mjs [base-url]   # defaults to the dev server
 */

import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/+$/, '')
const OUT = 'docs'

const SHOTS = [
  {
    file: 'landing.png',
    path: '/',
    viewport: { width: 1280, height: 820 },
    // The QR canvas is the last thing to appear on the sign-in page.
    waitFor: '#ring-signin-qr',
  },
  {
    file: 'mobile.png',
    path: '/',
    viewport: { width: 420, height: 900 },
    waitFor: '.pitch h2',
  },
]

async function main() {
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome' })

  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: shot.viewport,
        deviceScaleFactor: 2, // crisp on a retina README
        reducedMotion: 'reduce', // no half-played entrance animation
      })
      const page = await context.newPage()

      // `domcontentloaded`, never `networkidle`: the relay poll stays open.
      await page.goto(BASE + shot.path, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForSelector(shot.waitFor, { timeout: 30_000 })

      // The key field draws over ~1.4 s; let it settle before the shutter.
      await page.waitForTimeout(2000)

      await page.screenshot({ path: `${OUT}/${shot.file}` })
      console.log(`${shot.file}  ${shot.viewport.width}x${shot.viewport.height}`)

      await context.close()
    }
  } finally {
    await browser.close()
  }
}

await main()
