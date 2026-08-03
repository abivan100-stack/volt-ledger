/**
 * Ported verbatim from the original prototype's `setupCanvas` method
 * (Volt.dc.html). Pure canvas drawing/animation — touches the DOM directly,
 * which is why it lives next to Hero.tsx rather than in lib/.
 */
import { readCssVar } from '../ui/cssVars'
import { easeInOut } from '../../lib/easing'
import { rgb } from '../../theme/tokens'

interface MeshNode {
  nx: number
  ny: number
  name: string
  sur: boolean
  int: number
  recv: number
  out: number
  flash: number
  pph: number
}

interface MeshPacket {
  a: number
  b: number
  t0: number
  dur: number
  kwh: number
}

export interface HeroMeshOptions {
  activity: number
  reducedMotion: boolean
}

const NODE_POSITIONS = [
  { x: 0.13, y: 0.2 }, { x: 0.47, y: 0.1 }, { x: 0.82, y: 0.17 },
  { x: 0.26, y: 0.5 }, { x: 0.62, y: 0.43 }, { x: 0.91, y: 0.54 },
  { x: 0.17, y: 0.82 }, { x: 0.56, y: 0.84 },
]
const NODE_NAMES = ['Iyer', 'Murugan', 'Krishnan', 'Natarajan', 'Sundaram', 'Chandran', 'Selvaraj', 'Palani']
const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [3, 6], [4, 7], [6, 7], [5, 7], [2, 4],
]
const AMBER = rgb.sun
const TEAL = rgb.settle

export function startHeroMesh(canvas: HTMLCanvasElement, options: HeroMeshOptions): () => void {
  const ctx = canvas.getContext('2d')
  const wrap = canvas.parentElement
  if (!ctx || !wrap) return () => {}

  const inkSoftColor = readCssVar('--ink-soft')

  let width = 0
  let height = 0
  let dpr = 1
  const size = () => {
    const rect = wrap.getBoundingClientRect()
    dpr = Math.min(2, window.devicePixelRatio || 1)
    width = Math.max(10, rect.width)
    height = Math.max(10, rect.height)
    canvas.width = width * dpr
    canvas.height = height * dpr
  }
  size()
  const resizeObserver = new ResizeObserver(size)
  resizeObserver.observe(wrap)

  const nodes: MeshNode[] = NODE_POSITIONS.map((p, i) => ({
    nx: p.x,
    ny: p.y,
    name: NODE_NAMES[i],
    sur: i % 2 === 0,
    int: i % 2 === 0 ? 1 : 0,
    recv: 0,
    out: 1.2 + Math.random() * 3.2,
    flash: 0,
    pph: Math.random() * 7,
  }))
  let packets: MeshPacket[] = []
  let lastSpawn = 0
  let lastFlip = 0
  let last = performance.now()

  const projected = (n: MeshNode) => ({ x: n.nx * width, y: n.ny * height })

  const quadPoint = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => {
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const cx = mx - (dy / len) * len * 0.1
    const cy = my + (dx / len) * len * 0.1
    const u = 1 - t
    return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y }
  }

  const drawHouse = (x: number, y: number, s: number, color: string, glowAlpha: number, glowColor: string) => {
    if (glowAlpha > 0.01) {
      const gradient = ctx.createRadialGradient(x, y, 2, x, y, 34)
      gradient.addColorStop(0, `rgba(${glowColor},${(glowAlpha * 0.2).toFixed(3)})`)
      gradient.addColorStop(1, `rgba(${glowColor},0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(x, y, 34, 0, 7)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(x - s, y + s)
    ctx.lineTo(x - s, y - s * 0.15)
    ctx.lineTo(x, y - s)
    ctx.lineTo(x + s, y - s * 0.15)
    ctx.lineTo(x + s, y + s)
    ctx.closePath()
    ctx.fillStyle = '#FBF9F2'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  const draw = (t: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    ctx.strokeStyle = 'rgba(190,178,155,0.40)'
    ctx.lineWidth = 1
    const gridStep = 44
    ctx.beginPath()
    for (let x = 0.5 + gridStep; x < width; x += gridStep) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    }
    for (let y = 0.5 + gridStep; y < height; y += gridStep) {
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()

    ctx.strokeStyle = '#CFC6AE'
    ctx.lineWidth = 1
    for (const [ai, bi] of EDGES) {
      const a = projected(nodes[ai])
      const b = projected(nodes[bi])
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      const c = quadPoint(a, b, 0.5)
      ctx.quadraticCurveTo(2 * c.x - (a.x + b.x) / 2, 2 * c.y - (a.y + b.y) / 2, b.x, b.y)
      ctx.stroke()
    }

    const dt = Math.min(100, t - last) / 1000
    last = t

    if (!options.reducedMotion && t - lastFlip > 7000) {
      lastFlip = t
      const i = Math.floor(Math.random() * nodes.length)
      const surplusCount = nodes.filter((n) => n.sur).length
      if (nodes[i].sur ? surplusCount > 3 : surplusCount < 5) nodes[i].sur = !nodes[i].sur
    }

    if (!options.reducedMotion && t - lastSpawn > 950 / options.activity) {
      lastSpawn = t
      const candidates: Array<[number, number]> = []
      for (const [ai, bi] of EDGES) {
        if (nodes[ai].sur && !nodes[bi].sur) candidates.push([ai, bi])
        if (nodes[bi].sur && !nodes[ai].sur) candidates.push([bi, ai])
      }
      if (candidates.length) {
        const [a, b] = candidates[Math.floor(Math.random() * candidates.length)]
        packets.push({ a, b, t0: t, dur: 1700 + Math.random() * 600, kwh: 0.08 + Math.random() * 0.3 })
      }
    }

    packets = packets.filter((p) => {
      const q = (t - p.t0) / p.dur
      if (q >= 1) {
        nodes[p.b].recv += p.kwh
        nodes[p.b].flash = 1
        return false
      }
      const eased = easeInOut(q)
      const pos = quadPoint(projected(nodes[p.a]), projected(nodes[p.b]), eased)
      const alpha = Math.min(1, q / 0.14, (1 - q) / 0.16)
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 0.5, pos.x, pos.y, 10)
      gradient.addColorStop(0, `rgba(${AMBER},${(alpha * 0.45).toFixed(3)})`)
      gradient.addColorStop(1, `rgba(${AMBER},0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 10, 0, 7)
      ctx.fill()
      ctx.fillStyle = `rgba(${AMBER},${alpha.toFixed(3)})`
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 2.6, 0, 7)
      ctx.fill()
      return true
    })

    ctx.textAlign = 'center'
    for (const n of nodes) {
      const p = projected(n)
      n.int += ((n.sur ? 1 : 0) - n.int) * (options.reducedMotion ? 1 : dt * 2.5)
      const surplusIntensity = n.int

      if (surplusIntensity < 0.6) {
        const phase = options.reducedMotion ? 0.4 : (t / 2400 + n.pph) % 1
        const ringAlpha = (1 - phase) * 0.42 * (1 - surplusIntensity)
        if (ringAlpha > 0.01) {
          ctx.strokeStyle = `rgba(${TEAL},${ringAlpha.toFixed(3)})`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(p.x, p.y, 12 + phase * 14, 0, 7)
          ctx.stroke()
        }
      }

      if (n.flash > 0.01) {
        ctx.strokeStyle = `rgba(${AMBER},${(n.flash * 0.7).toFixed(3)})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(p.x, p.y, 11 + (1 - n.flash) * 10, 0, 7)
        ctx.stroke()
        n.flash -= dt * 2.2
      }

      const color = surplusIntensity > 0.5
        ? `rgba(178,106,18,${(0.55 + 0.45 * surplusIntensity).toFixed(3)})`
        : `rgba(36,92,67,${(0.55 + 0.45 * (1 - surplusIntensity)).toFixed(3)})`
      drawHouse(p.x, p.y, 9, color, surplusIntensity, surplusIntensity > 0.5 ? AMBER : TEAL)

      ctx.font = '500 9px "Spline Sans Mono",monospace'
      ctx.fillStyle = inkSoftColor
      ctx.fillText(n.name.toUpperCase(), p.x, p.y + 24)

      if (n.sur) {
        ctx.fillStyle = 'rgba(178,106,18,0.95)'
        ctx.fillText(`▲ ${n.out.toFixed(1)} kW`, p.x, p.y + 36)
      } else {
        ctx.fillStyle = 'rgba(36,92,67,0.95)'
        ctx.fillText(`+${n.recv.toFixed(2)} kWh`, p.x, p.y + 36)
      }
    }
  }

  let rafHandle: number | undefined
  if (options.reducedMotion) {
    draw(performance.now())
  } else {
    const loop = (t: number) => {
      draw(t)
      rafHandle = requestAnimationFrame(loop)
    }
    rafHandle = requestAnimationFrame(loop)
  }

  return () => {
    resizeObserver.disconnect()
    if (rafHandle !== undefined) cancelAnimationFrame(rafHandle)
  }
}
