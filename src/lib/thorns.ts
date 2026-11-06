// Procedural thorn geometry: frames for the UI and rings for the sample artwork.

export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Pt {
  x: number
  y: number
}

const f = (n: number) => n.toFixed(1)

/** A single curved thorn: base at p, pointing along n, leaning along t. */
function thorn(p: Pt, n: Pt, t: Pt, len: number, half: number, curl: number): string {
  const b1 = { x: p.x - t.x * half, y: p.y - t.y * half }
  const b2 = { x: p.x + t.x * half, y: p.y + t.y * half }
  const tip = { x: p.x + n.x * len + t.x * curl, y: p.y + n.y * len + t.y * curl }
  const c1 = {
    x: p.x + n.x * len * 0.45 - t.x * half * 0.4 + t.x * curl * 0.1,
    y: p.y + n.y * len * 0.45 - t.y * half * 0.4 + t.y * curl * 0.1,
  }
  const c2 = {
    x: p.x + n.x * len * 0.5 + t.x * half * 0.3 + t.x * curl * 0.6,
    y: p.y + n.y * len * 0.5 + t.y * half * 0.3 + t.y * curl * 0.6,
  }
  return `M${f(b1.x)} ${f(b1.y)}Q${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(c2.x)} ${f(c2.y)} ${f(b2.x)} ${f(b2.y)}Z`
}

export interface Gem {
  x: number
  y: number
  angle: number
}

export interface FrameGeometry {
  lineA: string
  lineB: string
  thorns: string
  gems: Gem[]
}

export function framePath(w: number, h: number, seed = 3): FrameGeometry {
  const r = rng(seed)
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
  const normals: Pt[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ]
  let thorns = ''
  const gems: Gem[] = []
  const lineA: string[] = []
  const lineB: string[] = []

  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    const n = normals[i]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }

    // hand-drawn double line with jitter
    for (let d = 0; d <= L; d += 14) {
      const j1 = (r() - 0.5) * 1.6
      const j2 = (r() - 0.5) * 1.6
      lineA.push(`${f(a.x + t.x * d + n.x * j1)} ${f(a.y + t.y * d + n.y * j1)}`)
      lineB.push(`${f(a.x + t.x * d - n.x * (3 + j2))} ${f(a.y + t.y * d - n.y * (3 + j2))}`)
    }

    // thorns along the side
    let d = 30
    while (d < L - 30) {
      if (Math.abs(d - L / 2) > 34) {
        const p = { x: a.x + t.x * d, y: a.y + t.y * d }
        const out = r() < 0.66 ? 1 : -1
        const len = 5 + Math.pow(r(), 2.2) * 30
        const half = 1.4 + r() * 2.4
        const curl = (r() - 0.5) * len * 0.9
        thorns += thorn(p, { x: n.x * out, y: n.y * out }, t, len, half, curl)
      }
      d += 9 + r() * 26
    }

    // gem at the centre of the side with radial thorns
    const gc = { x: a.x + t.x * (L / 2), y: a.y + t.y * (L / 2) }
    gems.push({ x: gc.x, y: gc.y, angle: (i % 2 === 0 ? 0 : 90) })
    for (let k = 0; k < 9; k++) {
      const ang = (k / 9) * Math.PI * 2 + r() * 0.3
      const dir = { x: Math.cos(ang), y: Math.sin(ang) }
      const tan = { x: -dir.y, y: dir.x }
      const base = { x: gc.x + dir.x * 11, y: gc.y + dir.y * 11 }
      thorns += thorn(base, dir, tan, 12 + r() * 16, 2.2, (r() - 0.5) * 10)
    }

    // big diagonal thorns at the start corner
    const cn = { x: a.x, y: a.y }
    const diag = { x: (n.x + normals[(i + 3) % 4].x) * 0.7071, y: (n.y + normals[(i + 3) % 4].y) * 0.7071 }
    thorns += thorn(cn, diag, { x: -diag.y, y: diag.x }, 46 + r() * 14, 3.6, 8)
    for (const spread of [-0.45, 0.45]) {
      const ang = Math.atan2(diag.y, diag.x) + spread
      const dir = { x: Math.cos(ang), y: Math.sin(ang) }
      thorns += thorn(cn, dir, { x: -dir.y, y: dir.x }, 22 + r() * 10, 2.6, (r() - 0.5) * 12)
    }
  }

  const poly = (pts: string[]) => `M${pts.join('L')}Z`
  return { lineA: poly(lineA), lineB: poly(lineB), thorns, gems }
}

/** Thorn crown ring (used for the sample artwork on canvas). */
export function ringPath(cx: number, cy: number, radius: number, seed = 5) {
  const r = rng(seed)
  let thorns = ''
  const steps = Math.round(radius * 0.55)
  for (let k = 0; k < steps; k++) {
    const ang = (k / steps) * Math.PI * 2 + (r() - 0.5) * 0.05
    const dir = { x: Math.cos(ang), y: Math.sin(ang) }
    const tan = { x: -dir.y, y: dir.x }
    const p = { x: cx + dir.x * radius, y: cy + dir.y * radius }
    const out = r() < 0.7 ? 1 : -1
    const len = 4 + Math.pow(r(), 2) * radius * 0.2
    thorns += thorn(p, { x: dir.x * out, y: dir.y * out }, tan, len, 1.5 + r() * 2, (r() - 0.5) * len)
  }
  const ring = `M${f(cx - radius)} ${f(cy)}A${f(radius)} ${f(radius)} 0 1 0 ${f(cx + radius)} ${f(cy)}A${f(radius)} ${f(radius)} 0 1 0 ${f(cx - radius)} ${f(cy)}Z`
  return { ring, thorns }
}
