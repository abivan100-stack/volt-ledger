import { describe, it, expect } from 'vitest'
import { buildDossier, type DossierHouseholdInput } from '../dossier'
import { appendBlock, type ChainBlock, type TradePayload } from '../hashChain'

function household(overrides: Partial<DossierHouseholdInput> = {}): DossierHouseholdInput {
  return {
    id: 0,
    name: 'Nikil Sundaram',
    pv: 4.2,
    base: 0.6,
    batt: 5.0,
    orient: 'South',
    tilt: 12,
    since: '2021',
    meter: 'NB-0417',
    out: 1.5,
    draw: 0.8,
    balance: 1240.4,
    gen: 12.0,
    con: 9.0,
    exp: 5.0,
    imp: 2.0,
    earned: 18.5,
    spent: 7.2,
    trades: 3,
    ...overrides,
  }
}

function chain(payloads: TradePayload[]): ChainBlock[] {
  let blocks: ChainBlock[] = []
  for (let i = 0; i < payloads.length; i++) {
    blocks.push(appendBlock(blocks, i + 1, payloads[i]))
  }
  return blocks
}

const SOLD: TradePayload = { t: '08:42', from: 'Nikil Sundaram', to: 'Prem Ramesh', kwh: 1.23, credit: 7.38 }
const BOUGHT: TradePayload = { t: '08:45', from: 'Prem Ramesh', to: 'Nikil Sundaram', kwh: 0.6, credit: 3.6 }
const OTHER: TradePayload = { t: '08:48', from: 'Pranav P', to: 'Prem Ramesh', kwh: 0.9, credit: 5.4 }

describe('buildDossier', () => {
  it('classifies the household net flow as EXPORTING', () => {
    const dossier = buildDossier(household(), chain([SOLD]), 510, 'sunny-weekday')
    expect(dossier.status).toBe('EXPORTING')
    expect(dossier.netPositive).toBe(true)
    expect(dossier.net).toBe('+0.70')
  })

  it('classifies a drawing household as IMPORTING', () => {
    const dossier = buildDossier(household({ out: 0.5, draw: 1.0 }), chain([]), 510, 'sunny-weekday')
    expect(dossier.status).toBe('IMPORTING')
    expect(dossier.netPositive).toBe(false)
    expect(dossier.net).toBe('−0.50')
  })

  it('classifies a near-zero net flow as BALANCED', () => {
    const dossier = buildDossier(household({ out: 1.0, draw: 1.05 }), chain([]), 510, 'sunny-weekday')
    expect(dossier.status).toBe('BALANCED')
  })

  it('derives panel count, array area, inverter, and battery from the roof spec', () => {
    const dossier = buildDossier(household(), chain([]), 510, 'sunny-weekday')
    expect(dossier.specs.find((s) => s.label === 'Panels')?.value).toBe('11 × 400 Wp')
    expect(dossier.specs.find((s) => s.label === 'Array area')?.value).toBe('21 m²')
    expect(dossier.specs.find((s) => s.label === 'Inverter')?.value).toBe('Hybrid 4.5 kW')
    expect(dossier.specs.find((s) => s.label === 'Battery')?.value).toBe('5.0 kWh')
    expect(dossier.specs.find((s) => s.label === 'Tariff')?.value).toBe('Prosumer · P2P export')
  })

  it('handles a household with no rooftop PV', () => {
    const dossier = buildDossier(household({ pv: 0, batt: 0, gen: 0, exp: 0, earned: 0 }), chain([]), 510, 'sunny-weekday')
    expect(dossier.specs.find((s) => s.label === 'Panels')?.value).toBe('—')
    expect(dossier.specs.find((s) => s.label === 'Array area')?.value).toBe('—')
    expect(dossier.specs.find((s) => s.label === 'Inverter')?.value).toBe('—')
    expect(dossier.specs.find((s) => s.label === 'Battery')?.value).toBe('None')
    expect(dossier.specs.find((s) => s.label === 'Tariff')?.value).toBe('Domestic · LT-1A')
    expect(dossier.selfNote).toBe('PURE CONSUMER · DRAWS ENTIRELY FROM THE STREET')
    expect(dossier.sub).toContain('No rooftop PV')
  })

  it('formats balance, clock, and day totals', () => {
    const dossier = buildDossier(household(), chain([]), 510, 'sunny-weekday')
    expect(dossier.balance).toBe('₹1,240.40')
    expect(dossier.now).toBe('08:30')
    expect(dossier.gen).toBe('12.0')
    expect(dossier.con).toBe('9.0')
    expect(dossier.exp).toBe('5.0')
    expect(dossier.imp).toBe('2.0')
    expect(dossier.trades).toBe('3')
    expect(dossier.earned).toBe('18.50')
    expect(dossier.spent).toBe('7.20')
  })

  it('computes the self-consumption share of generation', () => {
    const dossier = buildDossier(household({ gen: 12, exp: 5 }), chain([]), 510, 'sunny-weekday')
    expect(dossier.selfNote).toContain('SELF-CONSUMED 58% OF GENERATION')
  })

  it('clamps self-consumption to 0..100', () => {
    const negative = buildDossier(household({ gen: 4, exp: 6 }), chain([]), 510, 'sunny-weekday')
    expect(negative.selfNote).toContain('SELF-CONSUMED 0%')
    const over = buildDossier(household({ gen: 6, exp: 0 }), chain([]), 510, 'sunny-weekday')
    expect(over.selfNote).toContain('SELF-CONSUMED 100%')
  })

  it('builds chart geometry within the SVG coordinate space', () => {
    const dossier = buildDossier(household(), chain([]), 510, 'sunny-weekday')
    expect(dossier.genLine.split(' ').length).toBeGreaterThan(10)
    expect(dossier.conLine.split(' ').length).toBeGreaterThan(10)
    expect(dossier.areaPath.startsWith('M')).toBe(true)
    expect(dossier.areaPath.endsWith(' Z')).toBe(true)
    const xs = dossier.genLine.match(/(\d+\.\d)/g) ?? []
    for (const x of xs) {
      expect(Number(x)).toBeGreaterThanOrEqual(6)
      expect(Number(x)).toBeLessThanOrEqual(314)
    }
    expect(dossier.nowX).toBe(Number(dossier.nowX).toFixed(1))
    expect([dossier.ax6, dossier.ax12, dossier.ax18].every((v) => Number(v) > 0)).toBe(true)
  })

  it('keeps chart geometry finite for a zero-PV household', () => {
    const dossier = buildDossier(household({ pv: 0 }), chain([]), 510, 'sunny-weekday')
    const values = [...dossier.genLine.split(' '), ...dossier.conLine.split(' ')]
    for (const point of values) {
      for (const coord of point.split(',')) expect(Number.isFinite(Number(coord))).toBe(true)
    }
    expect(dossier.areaPath).toContain('Z')
  })

  it('lists only this household\'s ledger activity, newest first', () => {
    const blocks = chain([SOLD, BOUGHT, OTHER])
    const dossier = buildDossier(household(), blocks, 510, 'sunny-weekday')
    expect(dossier.activities).toHaveLength(2)
    expect(dossier.activities[0].time).toBe('08:45')
    expect(dossier.activities[0].direction).toBe('BOUGHT')
    expect(dossier.activities[0].arrow).toBe('←')
    expect(dossier.activities[0].counterparty).toBe('Prem Ramesh')
    expect(dossier.activities[0].credit).toBe('−₹3.60')
    expect(dossier.activities[1].time).toBe('08:42')
    expect(dossier.activities[1].direction).toBe('SOLD')
    expect(dossier.activities[1].credit).toBe('+₹7.38')
  })

  it('caps the activity list at the most recent six entries', () => {
    const many = chain(
      Array.from({ length: 8 }, (_, i) => ({
        t: `09:0${i}`,
        from: 'Nikil Sundaram',
        to: 'Prem Ramesh',
        kwh: 1,
        credit: 6,
      })),
    )
    const dossier = buildDossier(household(), many, 510, 'sunny-weekday')
    expect(dossier.activities).toHaveLength(6)
    expect(dossier.activities[0].time).toBe('09:07')
  })

  it('shows an empty-state when the household has no activity', () => {
    const dossier = buildDossier(household(), chain([OTHER]), 510, 'sunny-weekday')
    expect(dossier.activities).toHaveLength(0)
  })

  it('renders invalid activity entries', () => {
    const blocks = chain([SOLD])
    const tampered = blocks.map((b) => ({ ...b, payload: { ...b.payload, kwh: 99 }, invalid: true }))
    const dossier = buildDossier(household(), tampered, 510, 'sunny-weekday')
    expect(dossier.activities[0].invalid).toBe(true)
  })
})
