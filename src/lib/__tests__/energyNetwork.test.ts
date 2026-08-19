import { describe, expect, it } from 'vitest'
import {
  networkFeeders,
  networkFlows,
  networkNodes,
  networkStatus,
  RING,
  shortName,
  validNetworkTrades,
  type NetworkHousehold,
  type NetworkNode,
  type NetworkTrade,
  type StageSize,
} from '../energyNetwork'

const STAGE: StageSize = { width: 600, height: 450 }

function household(
  id: number,
  name: string,
  { out = 0, draw = 0 }: { out?: number; draw?: number } = {},
): NetworkHousehold {
  return { id, name, out, draw, net: out - draw }
}

const STREET: NetworkHousehold[] = [
  household(0, 'Nikil Sundaram', { out: 3.0, draw: 0.4 }),
  household(1, 'Prem Ramesh', { out: 0.2, draw: 0.9 }),
  household(2, 'Pranav P', { out: 4.0, draw: 0.6 }),
  household(3, 'Abivan', { out: 0, draw: 0.8 }),
  household(4, 'Karthik Iyer', { out: 0.5, draw: 0.45 }),
  household(5, 'Deepak Krishnan', { out: 2.0, draw: 1.2 }),
  household(6, 'Sanjay Murugan', { out: 3.4, draw: 0.7 }),
  household(7, 'Rahul Natarajan', { out: 0, draw: 1.0 }),
  household(8, 'Aravind Chandran', { out: 1.8, draw: 0.5 }),
  household(9, 'Surya Selvaraj', { out: 0.3, draw: 1.1 }),
]

describe('shortName', () => {
  it('keeps the first word only', () => {
    expect(shortName('Karthik Iyer')).toBe('Karthik')
    expect(shortName('Abivan')).toBe('Abivan')
  })
})

describe('networkNodes', () => {
  it('places the first household at the top of the ring and walks clockwise', () => {
    const nodes = networkNodes(STREET)

    expect(nodes).toHaveLength(10)
    expect(nodes[0].x).toBeCloseTo(RING.cx, 3)
    expect(nodes[0].y).toBeCloseTo(RING.cy - RING.ry, 3)
    expect(nodes[5].x).toBeCloseTo(RING.cx, 3)
    expect(nodes[5].y).toBeCloseTo(RING.cy + RING.ry, 3)
    // Every node sits on the ellipse.
    for (const node of nodes) {
      const nx = (node.x - RING.cx) / RING.rx
      const ny = (node.y - RING.cy) / RING.ry
      // 4dp: node coordinates are rounded to 3dp for stable DOM values.
      expect(nx * nx + ny * ny).toBeCloseTo(1, 4)
    }
  })

  it('labels with the uppercased first name and keeps the full name for assistive text', () => {
    const nodes = networkNodes(STREET)

    expect(nodes[4].label).toBe('KARTHIK')
    expect(nodes[4].name).toBe('Karthik Iyer')
  })

  it('classifies each node by its live net flow', () => {
    const nodes = networkNodes(STREET)

    expect(nodes[0].status).toBe('EXPORTING')
    expect(nodes[3].status).toBe('IMPORTING')
    expect(nodes[4].status).toBe('BALANCED')
  })

  it('puts the text block above the chip only on the top half of the ring', () => {
    const nodes = networkNodes(STREET)

    expect(nodes.filter((node) => node.labelAbove).map((node) => node.id)).toEqual([0, 1, 2, 8, 9])
  })

  it('keeps a slot per household id, so a node never moves when its role flips', () => {
    const before = networkNodes(STREET)
    const flipped = STREET.map((h, index) => (index === 0 ? household(0, h.name, { draw: 2 }) : h))
    const after = networkNodes(flipped)

    expect(after[0].status).toBe('IMPORTING')
    expect(after[0].x).toBe(before[0].x)
    expect(after[0].y).toBe(before[0].y)
  })

  it('returns nothing for an empty street', () => {
    expect(networkNodes([])).toEqual([])
  })
})

describe('networkFeeders', () => {
  it('keeps a perimeter loop and permanent cross-links visible', () => {
    const nodes = networkNodes(STREET)
    const feeders = networkFeeders(nodes, STAGE)

    expect(feeders).toHaveLength(15)
    expect(feeders.filter((feeder) => feeder.kind === 'loop')).toHaveLength(10)
    expect(feeders.filter((feeder) => feeder.kind === 'mesh')).toHaveLength(5)
    expect(feeders[0].key).toBe('loop-0-1')
    expect(feeders[9].key).toBe('loop-9-0')
    expect(feeders[10].key).toBe('mesh-0-3')
    expect(feeders[0].d).toMatch(/^M[\d.]+ [\d.]+ Q[\d.]+ [\d.]+ [\d.]+ [\d.]+$/)
  })

  it('keeps every household in one connected permanent web', () => {
    const nodes = networkNodes(STREET)
    const feeders = networkFeeders(nodes, STAGE)
    const adjacency = new Map(nodes.map((node) => [node.id, new Set<number>()]))

    for (const feeder of feeders) {
      const [, from, to] = feeder.key.split('-').map(Number)
      adjacency.get(from)?.add(to)
      adjacency.get(to)?.add(from)
    }

    const visited = new Set<number>([nodes[0].id])
    const pending = [nodes[0].id]
    while (pending.length) {
      const current = pending.pop()!
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next)
          pending.push(next)
        }
      }
    }

    expect(visited.size).toBe(nodes.length)
    expect([...adjacency.values()].every((links) => links.size >= 2)).toBe(true)
  })

  it('draws a single link between two households rather than one each way', () => {
    const nodes = networkNodes(STREET.slice(0, 2))

    expect(networkFeeders(nodes, STAGE)).toHaveLength(1)
  })

  it('draws nothing before the stage has been measured, or with nothing to link', () => {
    const nodes = networkNodes(STREET)

    expect(networkFeeders(nodes, { width: 0, height: 0 })).toEqual([])
    expect(networkFeeders(nodes, { width: 600, height: 0 })).toEqual([])
    expect(networkFeeders(networkNodes(STREET.slice(0, 1)), STAGE)).toEqual([])
  })
})

describe('networkFlows', () => {
  const nodes = networkNodes(STREET)

  it('aggregates repeat trades between the same pair into one weighted flow', () => {
    const trades: NetworkTrade[] = [
      { from: 'Pranav P', to: 'Abivan', kwh: 0.6 },
      { from: 'Pranav P', to: 'Abivan', kwh: 0.4 },
      { from: 'Nikil Sundaram', to: 'Rahul Natarajan', kwh: 0.5 },
    ]
    const flows = networkFlows(nodes, trades, STAGE)

    expect(flows).toHaveLength(2)
    const heavy = flows.find((flow) => flow.key === '2-3')
    expect(heavy?.kwh).toBeCloseTo(1.0, 5)
    expect(heavy?.from).toBe(2)
    expect(heavy?.to).toBe(3)
    expect(heavy?.weight).toBe(1)
    expect(heavy?.tier).toBe(1)
  })

  it('points the flow from seller to buyer, whichever way round the pair is stored', () => {
    const flows = networkFlows(nodes, [{ from: 'Abivan', to: 'Pranav P', kwh: 0.8 }], STAGE)

    expect(flows[0].key).toBe('2-3')
    expect(flows[0].from).toBe(3)
    expect(flows[0].to).toBe(2)
  })

  it('nets a pair that traded both ways instead of drawing two fighting arrows', () => {
    const flows = networkFlows(
      nodes,
      [
        { from: 'Pranav P', to: 'Abivan', kwh: 1.0 },
        { from: 'Abivan', to: 'Pranav P', kwh: 0.3 },
      ],
      STAGE,
    )

    expect(flows).toHaveLength(1)
    expect(flows[0].kwh).toBeCloseTo(0.7, 5)
    expect(flows[0].from).toBe(2)
  })

  it('drops a pair that nets out to nothing', () => {
    const flows = networkFlows(
      nodes,
      [
        { from: 'Pranav P', to: 'Abivan', kwh: 0.5 },
        { from: 'Abivan', to: 'Pranav P', kwh: 0.5 },
      ],
      STAGE,
    )

    expect(flows).toEqual([])
  })

  it('grades weight and pulse tier against the heaviest flow on screen', () => {
    const flows = networkFlows(
      nodes,
      [
        { from: 'Pranav P', to: 'Abivan', kwh: 1.0 },
        { from: 'Nikil Sundaram', to: 'Rahul Natarajan', kwh: 0.5 },
        { from: 'Sanjay Murugan', to: 'Surya Selvaraj', kwh: 0.2 },
      ],
      STAGE,
    )
    const tierByKey = Object.fromEntries(flows.map((flow) => [flow.key, flow.tier]))

    expect(tierByKey['2-3']).toBe(1)
    expect(tierByKey['0-7']).toBe(2)
    expect(tierByKey['6-9']).toBe(3)
  })

  it('emits a stable key order, so React never reorders the animated paths', () => {
    const trades: NetworkTrade[] = [
      { from: 'Sanjay Murugan', to: 'Surya Selvaraj', kwh: 0.2 },
      { from: 'Pranav P', to: 'Abivan', kwh: 1.0 },
      { from: 'Nikil Sundaram', to: 'Rahul Natarajan', kwh: 0.5 },
    ]
    const keys = networkFlows(nodes, trades, STAGE).map((flow) => flow.key)

    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)))
  })

  it('ignores trades it cannot place on the ring', () => {
    const flows = networkFlows(
      nodes,
      [
        { from: 'Somebody Else', to: 'Abivan', kwh: 1 },
        { from: 'Abivan', to: 'Abivan', kwh: 1 },
      ],
      STAGE,
    )

    expect(flows).toEqual([])
  })

  it('anchors the gradient on the two node centres and draws nothing unmeasured', () => {
    const flows = networkFlows(nodes, [{ from: 'Pranav P', to: 'Abivan', kwh: 1 }], STAGE)

    expect(flows[0].x1).toBeCloseTo((nodes[2].x / 100) * STAGE.width, 3)
    expect(flows[0].y1).toBeCloseTo((nodes[2].y / 100) * STAGE.height, 3)
    expect(flows[0].x2).toBeCloseTo((nodes[3].x / 100) * STAGE.width, 3)
    expect(networkFlows(nodes, [{ from: 'Pranav P', to: 'Abivan', kwh: 1 }], { width: 0, height: 450 })).toEqual([])
  })
})

describe('networkStatus', () => {
  it('classifies the street from its aggregate net position', () => {
    expect(networkStatus(STREET)).toBe('surplus')
  })

  it('calls the street balanced only inside the tolerance band', () => {
    const balanced = [household(0, 'A', { out: 1.0, draw: 0.6 })]
    const deficit = [household(0, 'A', { out: 0.2, draw: 2.0 })]

    expect(networkStatus(balanced)).toBe('balanced')
    expect(networkStatus(deficit)).toBe('deficit')
    expect(networkStatus([])).toBe('balanced')
  })
})

describe('validNetworkTrades', () => {
  it('excludes invalid and tampered settlements from the visible network', () => {
    const blocks = [
      { payload: { from: 'Pranav P', to: 'Abivan', kwh: 1 }, invalid: false, tampered: false },
      { payload: { from: 'Nikil Sundaram', to: 'Rahul Natarajan', kwh: 2 }, invalid: true, tampered: false },
      { payload: { from: 'Sanjay Murugan', to: 'Surya Selvaraj', kwh: 3 }, invalid: false, tampered: true },
    ]

    expect(validNetworkTrades(blocks)).toEqual([blocks[0].payload])
  })
})

/*
 * Label collision guard.
 *
 * These box constants mirror EnergyNetwork.css: --net-chip, --net-label-w and
 * the two line heights, at each of its four container-query steps. The stage
 * sizes are the measured stage box (panel width minus its padding, with the
 * aspect-ratio / min-height / max-height rules applied) at common viewport
 * widths, and each is paired with the box its own width selects. If the CSS
 * numbers move, these move with them — the point is that no two node units may
 * ever overlap, and none may leave the stage.
 */
interface NodeBox {
  chip: number
  labelW: number
  textH: number
  gap: number
}

/** Stage >= 464px. */
const WIDE_BOX: NodeBox = { chip: 40, labelW: 78, textH: 14 + 13, gap: 4 }
/** Stage 380-463px. */
const MID_BOX: NodeBox = { chip: 36, labelW: 68, textH: 13 + 12, gap: 4 }
/** Stage 330-379px. */
const NARROW_BOX: NodeBox = { chip: 34, labelW: 60, textH: 13 + 12, gap: 3 }
/** Stage < 330px. */
const TINY_BOX: NodeBox = { chip: 30, labelW: 52, textH: 12 + 11, gap: 3 }

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

function unitRect(node: NetworkNode, stage: StageSize, box: NodeBox): Rect {
  const x = (node.x / 100) * stage.width
  const y = (node.y / 100) * stage.height
  const half = box.chip / 2
  const textTop = node.labelAbove ? y - half - box.gap - box.textH : y + half + box.gap
  return {
    left: Math.min(x - half, x - box.labelW / 2),
    right: Math.max(x + half, x + box.labelW / 2),
    top: Math.min(y - half, textTop),
    bottom: Math.max(y + half, textTop + box.textH),
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

const LAYOUTS: Array<{ name: string; stage: StageSize; box: NodeBox }> = [
  { name: '1440px desktop, beside the headline', stage: { width: 508, height: 440 }, box: WIDE_BOX },
  { name: '1280px desktop, beside the headline', stage: { width: 508, height: 440 }, box: WIDE_BOX },
  { name: '1100px laptop, beside the headline', stage: { width: 452, height: 440 }, box: MID_BOX },
  { name: '1024px laptop, beside the headline', stage: { width: 410, height: 440 }, box: MID_BOX },
  { name: '998px laptop, narrowest two-column', stage: { width: 397, height: 440 }, box: MID_BOX },
  { name: '997px laptop, wrapped full width', stage: { width: 873, height: 560 }, box: WIDE_BOX },
  { name: '768px tablet, wrapped', stage: { width: 644, height: 483 }, box: WIDE_BOX },
  { name: '641px tablet, wrapped', stage: { width: 517, height: 440 }, box: WIDE_BOX },
  { name: '640px phone, full bleed', stage: { width: 608, height: 560 }, box: WIDE_BOX },
  { name: '500px phone, full bleed', stage: { width: 468, height: 440 }, box: WIDE_BOX },
  { name: '460px phone, full bleed', stage: { width: 428, height: 440 }, box: MID_BOX },
  { name: '412px phone, full bleed', stage: { width: 380, height: 440 }, box: MID_BOX },
  { name: '390px phone, full bleed', stage: { width: 358, height: 440 }, box: NARROW_BOX },
  { name: '362px phone, full bleed', stage: { width: 330, height: 440 }, box: NARROW_BOX },
  { name: '360px phone, full bleed', stage: { width: 328, height: 440 }, box: TINY_BOX },
  { name: '320px phone, full bleed', stage: { width: 288, height: 440 }, box: TINY_BOX },
]

describe('node label layout', () => {
  const nodes = networkNodes(STREET)

  it.each(LAYOUTS)('keeps every label clear of its neighbours at $name', ({ stage, box }) => {
    const rects = nodes.map((node) => unitRect(node, stage, box))

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(
          overlaps(rects[i], rects[j]),
          `${nodes[i].label} overlaps ${nodes[j].label}`,
        ).toBe(false)
      }
    }
  })

  it.each(LAYOUTS)('keeps every label inside the stage at $name', ({ stage, box }) => {
    for (const node of nodes) {
      const rect = unitRect(node, stage, box)
      expect(rect.left, `${node.label} left`).toBeGreaterThanOrEqual(0)
      expect(rect.top, `${node.label} top`).toBeGreaterThanOrEqual(0)
      expect(rect.right, `${node.label} right`).toBeLessThanOrEqual(stage.width)
      expect(rect.bottom, `${node.label} bottom`).toBeLessThanOrEqual(stage.height)
    }
  })
})
