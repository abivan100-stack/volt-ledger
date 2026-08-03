/**
 * Ported verbatim from the original prototype's `setupMap`/`mapPick` methods.
 * Unlike the hero mesh, this canvas reads *live* household data every frame —
 * via useEnergyStore.getState(), the store's non-reactive
 * "read right now" escape hatch, so the rAF loop never needs a React re-render.
 * The original never used a ResizeObserver here (unlike the hero mesh) —
 * it re-measures getBoundingClientRect() on every frame instead; preserved
 * as-is rather than unified with the other canvas's approach.
 */
import { useEnergyStore } from '../../../store/useEnergyStore'
import { HOUSEHOLD_COUNT } from '../../../store/simSlice'
import { readCssVar } from '../../ui/cssVars'
import { easeInOut } from '../../../lib/easing'
import { rgb } from '../../../theme/tokens'

interface Point {
  x: number
  y: number
}

interface MapPacket {
  a: number
  b: number
  t0: number
  dur: number
}

export interface NeighbourhoodMapOptions {
  reducedMotion: boolean
}

export interface NeighbourhoodMapHandle {
  stop: () => void
  pick: (x: number, y: number) => number
  setPaused: (paused: boolean) => void
}

const SUN = rgb.sun
const TEAL = rgb.settle
const INK = rgb.ink
const RULE = rgb['rule-2']
const COLS = 5

/** |net| above which a household is drawn as actively exporting/importing. */
const ACTIVE_NET_THRESHOLD = 0.12
/** net above which a household is a packet source. */
const PACKET_EXPORT_THRESHOLD = 0.2
/** net below which a household is a packet sink. */
const PACKET_IMPORT_THRESHOLD = -0.1

export function startNeighbourhoodMap(
  canvas: HTMLCanvasElement,
  options: NeighbourhoodMapOptions,
): NeighbourhoodMapHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { stop: () => {}, pick: () => -1, setPaused: () => {} }

  const inkSoftColor = readCssVar('--ink-soft')
  const cardColor = readCssVar('--card')

  let width = 0
  let height = 0
  let dpr = 1

  const refresh = (): boolean => {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    width = Math.max(10, rect.width)
    height = Math.max(10, rect.height)
    const bufferWidth = Math.round(width * dpr)
    const bufferHeight = Math.round(height * dpr)
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth
      canvas.height = bufferHeight
    }
    return true
  }

  const projections: Array<Point | undefined> = new Array(HOUSEHOLD_COUNT)
  let packets: MapPacket[] = []
  let lastSpawn = 0

  const layout = () => {
    const padX = Math.max(40, width * 0.06)
    const busY = height * 0.5
    const rowGap = Math.min(140, height * 0.28)
    const yTop = busY - rowGap
    const yBottom = busY + rowGap
    const colWidth = (width - 2 * padX) / COLS
    const colX = (c: number) => padX + (c + 0.5) * colWidth
    const houseSize = Math.min(50, colWidth * 0.46)
    const gaugeRadius = houseSize * 0.82
    const pos = (i: number): Point & { top: boolean } => {
      const c = i % COLS
      const top = i < COLS
      return { x: colX(c), y: top ? yTop : yBottom, top }
    }
    const edgeY = (p: Point & { top: boolean }) => (p.top ? p.y + houseSize / 2 : p.y - houseSize / 2)
    return { busY, colX, houseSize, gaugeRadius, pos, edgeY }
  }

  const draw = (t: number) => {
    const households = useEnergyStore.getState().households
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const { busY, houseSize, gaugeRadius, pos, edgeY, colX } = layout()
    const busX0 = colX(0)
    const busX1 = colX(COLS - 1)

    ctx.strokeStyle = `rgba(${INK},0.28)`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(busX0, busY)
    ctx.lineTo(busX1, busY)
    ctx.stroke()

    ctx.strokeStyle = `rgba(${INK},0.12)`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(busX0, busY - 4)
    ctx.lineTo(busX1, busY - 4)
    ctx.moveTo(busX0, busY + 4)
    ctx.lineTo(busX1, busY + 4)
    ctx.stroke()

    if (busX1 + 82 < width) {
      ctx.textAlign = 'left'
      ctx.font = '500 8px "Spline Sans Mono",monospace'
      ctx.fillStyle = inkSoftColor
      ctx.fillText('SHARED BUS', busX1 + 9, busY - 5)
    }

    for (let i = 0; i < HOUSEHOLD_COUNT; i++) {
      const p = pos(i)
      const net = households[i].net
      const color = net > ACTIVE_NET_THRESHOLD ? SUN : net < -ACTIVE_NET_THRESHOLD ? TEAL : RULE
      const alpha = net > ACTIVE_NET_THRESHOLD ? 0.58 : net < -ACTIVE_NET_THRESHOLD ? 0.52 : 0.22
      ctx.strokeStyle = `rgba(${color},${alpha})`
      ctx.lineWidth = net > ACTIVE_NET_THRESHOLD || net < -ACTIVE_NET_THRESHOLD ? 1.6 : 1
      ctx.beginPath()
      ctx.moveTo(p.x, edgeY(p))
      ctx.lineTo(p.x, busY)
      ctx.stroke()
      ctx.fillStyle = `rgba(${color},${Math.max(0.32, alpha)})`
      ctx.fillRect(p.x - 2.5, busY - 2.5, 5, 5)
      projections[i] = { x: p.x, y: p.y }
    }

    if (!options.reducedMotion) {
      if (t - lastSpawn > 520) {
        lastSpawn = t
        const exporters: number[] = []
        const importers: number[] = []
        for (let i = 0; i < HOUSEHOLD_COUNT; i++) {
          if (households[i].net > PACKET_EXPORT_THRESHOLD) exporters.push(i)
          if (households[i].net < PACKET_IMPORT_THRESHOLD) importers.push(i)
        }
        if (exporters.length && importers.length) {
          packets.push({
            a: exporters[Math.floor(Math.random() * exporters.length)],
            b: importers[Math.floor(Math.random() * importers.length)],
            t0: t,
            dur: 1500 + Math.random() * 500,
          })
        }
      }
      packets = packets.filter((packet) => {
        const q = (t - packet.t0) / packet.dur
        if (q >= 1) return false
        const a = pos(packet.a)
        const b = pos(packet.b)
        const ea = edgeY(a)
        const eb = edgeY(b)
        const l1 = Math.abs(busY - ea)
        const l2 = Math.abs(b.x - a.x)
        const l3 = Math.abs(eb - busY)
        const total = l1 + l2 + l3 || 1
        const d = easeInOut(q) * total
        let x: number
        let y: number
        if (d < l1) {
          x = a.x
          y = ea + (busY - ea) * (d / (l1 || 1))
        } else if (d < l1 + l2) {
          const u = (d - l1) / (l2 || 1)
          x = a.x + (b.x - a.x) * u
          y = busY
        } else {
          const u = (d - l1 - l2) / (l3 || 1)
          x = b.x
          y = busY + (eb - busY) * u
        }
        const alpha = Math.min(1, q / 0.12, (1 - q) / 0.14)
        const gradient = ctx.createRadialGradient(x, y, 0.5, x, y, 9)
        gradient.addColorStop(0, `rgba(${SUN},${(alpha * 0.55).toFixed(3)})`)
        gradient.addColorStop(1, `rgba(${SUN},0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, 9, 0, 7)
        ctx.fill()
        ctx.fillStyle = `rgba(${SUN},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, 2.6, 0, 7)
        ctx.fill()
        return true
      })
    }

    for (let i = 0; i < HOUSEHOLD_COUNT; i++) {
      const p = pos(i)
      const h = households[i]
      const net = h.net
      const cx = p.x
      const cy = p.y

      if (net > ACTIVE_NET_THRESHOLD) {
        const mag = Math.min(1, net / 2.4)
        const breathe = options.reducedMotion ? 1 : 0.86 + 0.14 * Math.sin(t / 700 + i)
        const radius = (houseSize * 0.85 + mag * houseSize * 1.6) * breathe
        const gradient = ctx.createRadialGradient(cx, cy, houseSize * 0.3, cx, cy, radius)
        gradient.addColorStop(0, `rgba(${SUN},${(0.26 * (0.5 + mag)).toFixed(3)})`)
        gradient.addColorStop(1, `rgba(${SUN},0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, 7)
        ctx.fill()
      } else if (net < -ACTIVE_NET_THRESHOLD) {
        const mag = Math.min(1, -net / 2)
        const phase = options.reducedMotion ? 0.4 : (t / 1400) % 1
        const ringRadius = houseSize * (1.35 - phase * 0.72)
        ctx.strokeStyle = `rgba(${TEAL},${(0.5 * mag * (1 - phase)).toFixed(3)})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(cx, cy, ringRadius, 0, 7)
        ctx.stroke()
      }

      ctx.strokeStyle = `rgba(${INK},0.10)`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx, cy, gaugeRadius, 0, 7)
      ctx.stroke()

      const frac = Math.min(1, Math.abs(net) / 2.6)
      if (frac > 0.02) {
        const give = net >= 0
        ctx.strokeStyle = give ? `rgba(${SUN},0.95)` : `rgba(${TEAL},0.95)`
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.arc(cx, cy, gaugeRadius, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2 * (give ? 1 : -1), !give)
        ctx.stroke()
        ctx.lineCap = 'butt'
      }

      ctx.fillStyle = cardColor
      ctx.strokeStyle = `rgba(${INK},0.62)`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.rect(cx - houseSize / 2, cy - houseSize / 2, houseSize, houseSize)
      ctx.fill()
      ctx.stroke()

      if (h.pv > 0) {
        const panelSize = houseSize * 0.6
        ctx.fillStyle = `rgba(${SUN},0.85)`
        ctx.fillRect(cx - panelSize / 2, cy - panelSize / 2, panelSize, panelSize)
        ctx.strokeStyle = `rgba(${INK},0.38)`
        ctx.lineWidth = 0.75
        ctx.beginPath()
        ctx.moveTo(cx - panelSize / 2, cy)
        ctx.lineTo(cx + panelSize / 2, cy)
        ctx.moveTo(cx, cy - panelSize / 2)
        ctx.lineTo(cx, cy + panelSize / 2)
        ctx.stroke()
        ctx.strokeStyle = `rgba(${INK},0.24)`
        ctx.strokeRect(cx - panelSize / 2, cy - panelSize / 2, panelSize, panelSize)
      } else {
        ctx.fillStyle = `rgba(${INK},0.22)`
        ctx.beginPath()
        ctx.arc(cx, cy, 3.5, 0, 7)
        ctx.fill()
      }
    }

    ctx.textAlign = 'center'
    for (let i = 0; i < HOUSEHOLD_COUNT; i++) {
      const p = pos(i)
      const h = households[i]
      const net = h.net
      const cx = p.x
      const nameY = p.top ? p.y - gaugeRadius - 20 : p.y + gaugeRadius + 16
      const valueY = p.top ? p.y - gaugeRadius - 8 : p.y + gaugeRadius + 28
      ctx.font = '500 9.5px "Spline Sans Mono",monospace'
      ctx.fillStyle = inkSoftColor
      ctx.fillText(h.name.split(' ')[0].toUpperCase(), cx, nameY)
      ctx.font = '600 9.5px "Spline Sans Mono",monospace'
      if (net > ACTIVE_NET_THRESHOLD) {
        ctx.fillStyle = `rgba(${SUN},0.95)`
        ctx.fillText(`▲ ${net.toFixed(1)} kW`, cx, valueY)
      } else if (net < -ACTIVE_NET_THRESHOLD) {
        ctx.fillStyle = `rgba(${TEAL},0.95)`
        ctx.fillText(`▼ ${Math.abs(net).toFixed(1)} kW`, cx, valueY)
      } else {
        ctx.fillStyle = inkSoftColor
        ctx.fillText('— idle', cx, valueY)
      }
    }
  }

  const pick = (x: number, y: number): number => {
    let best = -1
    let bestDistance = 46
    for (let i = 0; i < projections.length; i++) {
      const p = projections[i]
      if (!p) continue
      const distance = Math.hypot(p.x - x, p.y - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    return best
  }

  let rafHandle: number | undefined
  let intervalHandle: ReturnType<typeof setInterval> | undefined
  let visibilityHandler: (() => void) | undefined
  let startLoop: (() => void) | undefined
  let isPaused = false
  let dead = false

  if (options.reducedMotion) {
    let tries = 0
    const once = () => {
      if (isPaused) return
      if (refresh()) {
        draw(performance.now())
      } else if (tries++ < 180) {
        requestAnimationFrame(once)
      }
    }
    once()
    intervalHandle = setInterval(once, 1400)
  } else {
    const paintOnce = (): boolean => {
      if (refresh()) {
        draw(performance.now())
        return true
      }
      return false
    }
    let warmTries = 0
    const warm = () => {
      if (dead || isPaused || paintOnce()) return
      if (warmTries++ < 240) setTimeout(warm, 60)
    }
    warm()
    const loop = (t: number) => {
      if (dead) return
      if (isPaused || document.hidden) return
      if (refresh()) draw(t)
      rafHandle = requestAnimationFrame(loop)
    }
    startLoop = () => {
      if (rafHandle !== undefined) cancelAnimationFrame(rafHandle)
      rafHandle = requestAnimationFrame(loop)
    }
    rafHandle = requestAnimationFrame(loop)
    visibilityHandler = () => {
      if (!document.hidden && !dead && !isPaused) {
        paintOnce()
        startLoop?.()
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  return {
    pick,
    setPaused: (paused: boolean) => {
      if (paused === isPaused || dead) return
      isPaused = paused
      if (!paused && !options.reducedMotion && !document.hidden) startLoop?.()
    },
    stop: () => {
      dead = true
      if (rafHandle !== undefined) cancelAnimationFrame(rafHandle)
      if (intervalHandle !== undefined) clearInterval(intervalHandle)
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
    },
  }
}
