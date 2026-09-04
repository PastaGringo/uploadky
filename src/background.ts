/**
 * The key field.
 *
 * Long curves traced through a flow field seeded by the signed-in public key —
 * the way iron filings settle around a magnet. The same key always draws the
 * same picture; two keys never draw the same one. An identity gets a face.
 *
 * On load, and on every key change, the lines grow in over ~1.4 s: one
 * orchestrated moment rather than a permanent animation. Under
 * `prefers-reduced-motion` they appear at once.
 *
 * Signed out, a fixed seed is used so the page is never bare.
 */

const SIGNED_OUT_SEED = 'uploadky'
const REVEAL_MS = 1400

interface Line {
  points: Float32Array // x0,y0,x1,y1,...
  hot: number // 0..1 — how close to the amber pool
}

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let seed = SIGNED_OUT_SEED
let lines: Line[] = []
let raf = 0
let revealStart = 0
let reduceMotion = false

export function startKeyField() {
  canvas = document.querySelector<HTMLCanvasElement>('#keyfield')
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  ctx = context

  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  window.addEventListener('resize', rebuild, { passive: true })
  rebuild()
}

/** Re-seed from the signed-in key, or pass undefined when signing out. */
export function setKeyFieldSeed(publicKey?: string) {
  const next = publicKey || SIGNED_OUT_SEED
  if (next === seed) return
  seed = next
  rebuild()
}

function rebuild() {
  if (!canvas || !ctx) return

  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(window.innerWidth * ratio)
  canvas.height = Math.floor(window.innerHeight * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

  lines = trace(window.innerWidth, window.innerHeight, seed)

  cancelAnimationFrame(raf)
  if (reduceMotion) {
    paint(1)
    return
  }
  revealStart = performance.now()
  raf = requestAnimationFrame(tick)
}

function tick(now: number) {
  const t = Math.min(1, (now - revealStart) / REVEAL_MS)
  // Ease-out so the lines land softly rather than snap.
  paint(1 - Math.pow(1 - t, 3))
  if (t < 1) raf = requestAnimationFrame(tick)
}

// ------------------------------------------------------------------- trace

function trace(w: number, h: number, key: string): Line[] {
  const rng = hashSeed(key)

  // Where the amber sits: keep it off-centre, on the card's side of the page.
  const hx = w * (0.12 + rng() * 0.3)
  const hy = h * (0.25 + rng() * 0.5)
  const scale = Math.max(w, h)

  // Field parameters — this is the part the key actually decides.
  const f1 = 1.2 + rng() * 1.6
  const f2 = 0.8 + rng() * 1.4
  const twist = rng() * Math.PI * 2
  const swirl = 0.6 + rng() * 1.2

  const angleAt = (x: number, y: number) => {
    const nx = x / w
    const ny = y / h
    const dx = x - hx
    const dy = y - hy
    const spin = Math.atan2(dy, dx) + Math.PI / 2 // tangential to the pool
    const wave = Math.sin(nx * f1 * Math.PI * 2 + twist) * 0.9 + Math.cos(ny * f2 * Math.PI * 2 - twist) * 0.9
    const near = Math.max(0, 1 - Math.hypot(dx, dy) / (scale * 0.55))
    return wave * (1 - near * swirl) + spin * near * swirl
  }

  const count = Math.round((w * h) / 9000) // density even across viewports
  const steps = 70
  const stepLen = 3.2
  const out: Line[] = []

  for (let i = 0; i < count; i++) {
    let x = rng() * w
    let y = rng() * h
    const pts = new Float32Array((steps + 1) * 2)
    pts[0] = x
    pts[1] = y

    for (let s = 1; s <= steps; s++) {
      const a = angleAt(x, y)
      x += Math.cos(a) * stepLen
      y += Math.sin(a) * stepLen
      pts[s * 2] = x
      pts[s * 2 + 1] = y
    }

    const mx = pts[steps] // midpoint-ish x
    const my = pts[steps + 1]
    const hot = Math.max(0, 1 - Math.hypot(mx - hx, my - hy) / (scale * 0.42))
    out.push({ points: pts, hot })
  }

  return out
}

// ------------------------------------------------------------------- paint

function paint(progress: number) {
  if (!ctx) return
  const w = window.innerWidth
  const h = window.innerHeight

  ctx.clearRect(0, 0, w, h)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const line of lines) {
    const total = line.points.length / 2
    const n = Math.max(2, Math.floor(total * progress))
    if (n < 2) continue

    const a = 0.06 + line.hot * 0.34
    ctx.strokeStyle =
      line.hot > 0.3
        ? `rgba(255, 166, 43, ${a})`
        : `rgba(150, 210, 205, ${0.05 + line.hot * 0.12})`
    ctx.lineWidth = 0.9 + line.hot * 1.1

    ctx.beginPath()
    ctx.moveTo(line.points[0], line.points[1])
    for (let i = 1; i < n; i++) {
      ctx.lineTo(line.points[i * 2], line.points[i * 2 + 1])
    }
    ctx.stroke()
  }
}

/**
 * Small deterministic PRNG seeded by the string. Not cryptographic — it only
 * has to be stable and well spread, so a key always draws the same field.
 */
function hashSeed(value: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
