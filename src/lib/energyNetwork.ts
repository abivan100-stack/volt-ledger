/**
 * Community energy network — the graph model behind the landing-page hero.
 *
 * Every node is a real household from the store and every flow is a real
 * settlement already written to the hash chain; nothing here invents data.
 *
 * Two kinds of edge, deliberately drawn differently:
 * - the **neighbourhood web**, the physical low-voltage loop plus permanent
 *   cross-links between homes. Always present, never carries a value — it is
 *   the street's wiring, not its trading.
 * - **flows**, one per pair of households that actually settled energy inside
 *   the recent chain window, carrying direction (seller to buyer) and weight
 *   (kWh settled). These are what the eye should follow.
 *
 * Node positions are emitted as percentages of the stage box (0-100), so the
 * same numbers place the DOM node chips through `left`/`top`. Edge geometry is
 * emitted in CSS pixels against a measured stage size, so the SVG viewBox maps
 * 1:1 to the element and stroke widths and dash lengths never distort.
 *
 * A slot belongs to a household id, never to a role: a node keeps its place on
 * the ring all day, so the picture reads as one street changing state rather
 * than ten dots rearranging themselves every tick.
 */
import { statusForNet, type HouseholdStatus } from './householdStatus'

/** The household fields the graph needs — a structural subset of the store's `Household`. */
export interface NetworkHousehold {
  id: number
  name: string
  out: number
  draw: number
  net: number
}

/** One settled trade, as recorded in a chain block's payload. */
export interface NetworkTrade {
  from: string
  to: string
  kwh: number
}

export interface NetworkBlock {
  payload: NetworkTrade
  invalid: boolean
  tampered: boolean
}

/** Measured stage box, in CSS pixels. */
export interface StageSize {
  width: number
  height: number
}

export interface NetworkNode {
  id: number
  /** Full household name, for assistive text. */
  name: string
  /** First name, uppercased — what the graph prints. */
  label: string
  status: HouseholdStatus
  net: number
  /** Percentage of the stage box, 0-100. */
  x: number
  y: number
  /** True on the ring's top half, where the text block sits above the chip. */
  labelAbove: boolean
}

export interface NetworkFeeder {
  key: string
  d: string
  kind: 'loop' | 'mesh'
}

export interface NetworkFlow {
  key: string
  /** Index of the node the energy left. */
  from: number
  /** Index of the node the energy arrived at. */
  to: number
  d: string
  x1: number
  y1: number
  x2: number
  y2: number
  kwh: number
  /** 0-1: this flow's share of the heaviest flow on screen. */
  weight: number
  /**
   * 1 (heaviest) to 3 (lightest) — picks the pulse-speed class. Quantised on
   * purpose: a per-tick fractional duration would restart the CSS animation
   * every second.
   */
  tier: 1 | 2 | 3
}

export const NETWORK_STATUSES = ['surplus', 'balanced', 'deficit'] as const
export type NetworkStatus = (typeof NETWORK_STATUSES)[number]

/**
 * Ring geometry, as percentages of the stage box. The text block sits outside
 * the ring, so head- and footroom matter more than side margin — which is why
 * `ry` stays close to `rx` rather than filling the taller axis.
 */
export const RING = { cx: 50, cy: 50, rx: 33.5, ry: 35.5, startAngleDeg: -90 } as const

/** How far a chord's control point is pulled toward the ring centre. */
const FLOW_BOW = 0.34
const FEEDER_BOW = 0.12

/** Chain blocks that count as live flow — roughly the last few minutes of settlements. */
export const FLOW_WINDOW = 14

/** Only cryptographically sound settlements are allowed to become visible flows. */
export function validNetworkTrades(blocks: NetworkBlock[]): NetworkTrade[] {
  return blocks.filter((block) => !block.invalid && !block.tampered).map((block) => block.payload)
}

/** kWh below which an aggregated pair is noise rather than a flow worth drawing. */
const MIN_FLOW_KWH = 0.01

/** Community |kW| below which the street as a whole counts as balanced. */
const BALANCE_TOLERANCE_KW = 0.6

const HEAVY_FLOW_WEIGHT = 0.66
const MEDIUM_FLOW_WEIGHT = 0.33

/** "Karthik Iyer" becomes "Karthik" — a graph label has room for one word. */
export function shortName(name: string): string {
  return name.split(' ')[0]
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

interface Point {
  x: number
  y: number
}

function ringPoint(index: number, count: number): Point {
  const angle = ((RING.startAngleDeg + (360 / count) * index) * Math.PI) / 180
  return { x: RING.cx + RING.rx * Math.cos(angle), y: RING.cy + RING.ry * Math.sin(angle) }
}

export function networkNodes(households: NetworkHousehold[]): NetworkNode[] {
  return households.map((household, index) => {
    const point = ringPoint(index, households.length)
    return {
      id: household.id,
      name: household.name,
      label: shortName(household.name).toUpperCase(),
      status: statusForNet(household.net),
      net: household.net,
      x: round(point.x),
      y: round(point.y),
      labelAbove: point.y < RING.cy,
    }
  })
}

function toPixels(node: NetworkNode, size: StageSize): Point {
  return { x: (node.x / 100) * size.width, y: (node.y / 100) * size.height }
}

/** Quadratic chord between two nodes, bowed toward the centre of the stage. */
function chord(a: Point, b: Point, size: StageSize, bow: number): string {
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const controlX = midX + (size.width / 2 - midX) * bow
  const controlY = midY + (size.height / 2 - midY) * bow
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}

function hasStage(size: StageSize): boolean {
  return Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
}

/**
 * The always-visible neighbourhood topology: a closed perimeter loop plus a
 * restrained set of cross-links. For the ten-home street, each home gets the
 * two neighbouring links and one cross-link, so the map remains recognisably
 * connected even when no settlement has occurred in the recent flow window.
 */
export function networkFeeders(nodes: NetworkNode[], size: StageSize): NetworkFeeder[] {
  if (nodes.length < 2 || !hasStage(size)) return []
  const span = nodes.length === 2 ? 1 : nodes.length
  const feeders: NetworkFeeder[] = []
  for (let i = 0; i < span; i++) {
    const from = nodes[i]
    const to = nodes[(i + 1) % nodes.length]
    feeders.push({
      key: `loop-${from.id}-${to.id}`,
      d: chord(toPixels(from, size), toPixels(to, size), size, FEEDER_BOW),
      kind: 'loop',
    })
  }

  if (nodes.length >= 6) {
    const crossLinkOffset = Math.max(2, Math.floor(nodes.length / 3))
    for (let i = 0; i < nodes.length; i += 2) {
      const from = nodes[i]
      const to = nodes[(i + crossLinkOffset) % nodes.length]
      feeders.push({
        key: `mesh-${from.id}-${to.id}`,
        d: chord(toPixels(from, size), toPixels(to, size), size, FLOW_BOW),
        kind: 'mesh',
      })
    }
  }

  return feeders
}

function flowTier(weight: number): 1 | 2 | 3 {
  if (weight > HEAVY_FLOW_WEIGHT) return 1
  if (weight > MEDIUM_FLOW_WEIGHT) return 2
  return 3
}

/**
 * Settled trades, folded into one drawn flow per household pair. A pair that
 * traded both ways nets off, so the street never shows two arrows fighting
 * over the same wire.
 */
export function networkFlows(
  nodes: NetworkNode[],
  trades: NetworkTrade[],
  size: StageSize,
): NetworkFlow[] {
  if (!hasStage(size)) return []
  const indexByName = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) {
    if (!indexByName.has(nodes[i].name)) indexByName.set(nodes[i].name, i)
  }
  const netKwhByPair = new Map<string, number>()

  for (const trade of trades) {
    const seller = indexByName.get(trade.from)
    const buyer = indexByName.get(trade.to)
    if (seller === undefined || buyer === undefined || seller === buyer) continue
    const low = Math.min(seller, buyer)
    const high = Math.max(seller, buyer)
    const key = `${low}-${high}`
    const signed = seller === low ? trade.kwh : -trade.kwh
    netKwhByPair.set(key, (netKwhByPair.get(key) ?? 0) + signed)
  }

  const pairs: Array<{ key: string; from: number; to: number; kwh: number }> = []
  for (const [key, signed] of netKwhByPair) {
    const kwh = Math.abs(signed)
    if (kwh < MIN_FLOW_KWH) continue
    const [low, high] = key.split('-').map(Number)
    pairs.push({ key, from: signed > 0 ? low : high, to: signed > 0 ? high : low, kwh })
  }
  if (!pairs.length) return []

  const heaviest = pairs.reduce((max, pair) => Math.max(max, pair.kwh), 0)
  // Sorted numerically by key for stable paint order without lexical pitfalls for >9 nodes.
  pairs.sort((a, b) => {
    const [aLow, aHigh] = a.key.split('-').map(Number)
    const [bLow, bHigh] = b.key.split('-').map(Number)
    return aLow - bLow || aHigh - bHigh
  })

  return pairs.map((pair) => {
    const from = toPixels(nodes[pair.from], size)
    const to = toPixels(nodes[pair.to], size)
    const weight = heaviest > 0 ? pair.kwh / heaviest : 0
    return {
      key: pair.key,
      from: pair.from,
      to: pair.to,
      d: chord(from, to, size, FLOW_BOW),
      x1: round(from.x),
      y1: round(from.y),
      x2: round(to.x),
      y2: round(to.y),
      kwh: pair.kwh,
      weight: round(weight),
      tier: flowTier(weight),
    }
  })
}

export function networkStatus(households: NetworkHousehold[]): NetworkStatus {
  const balance = households.reduce((total, household) => total + household.net, 0)
  const status: NetworkStatus =
    balance > BALANCE_TOLERANCE_KW
      ? 'surplus'
      : balance < -BALANCE_TOLERANCE_KW
        ? 'deficit'
        : 'balanced'
  return status
}
