import { solarCurve, demandCurve, type DayType } from './simulation'
import { formatClock, formatMoney } from './format'
import type { ChainBlock } from './hashChain'
import { statusForNet, type HouseholdStatus } from './householdStatus'

/**
 * Takes only the fields it actually needs (a structural subset of Household)
 * rather than importing the type from the store, so this stays a
 * framework-free module like the rest of lib/.
 */
export interface DossierHouseholdInput {
  id: number
  name: string
  pv: number
  base: number
  batt: number
  orient: string
  tilt: number
  since: string
  meter: string
  out: number
  draw: number
  balance: number
  gen: number
  con: number
  exp: number
  imp: number
  earned: number
  spent: number
  trades: number
}

export interface DossierSpec {
  label: string
  value: string
}

export interface DossierActivity {
  id: number
  time: string
  direction: 'SOLD' | 'BOUGHT'
  arrow: string
  counterparty: string
  kwh: string
  credit: string
  invalid: boolean
}

export interface DossierViewModel {
  name: string
  status: HouseholdStatus
  sub: string
  out: string
  draw: string
  net: string
  netPositive: boolean
  balance: string
  now: string
  genLine: string
  conLine: string
  areaPath: string
  nowX: string
  ax6: string
  ax12: string
  ax18: string
  gen: string
  con: string
  exp: string
  imp: string
  selfNote: string
  earned: string
  spent: string
  trades: string
  specs: DossierSpec[]
  activities: DossierActivity[]
}

const CHART_WIDTH = 320
const CHART_PAD_LEFT = 6
const CHART_PAD_RIGHT = 6
const CHART_PAD_TOP = 12
const CHART_Y_BASE = 112
const CHART_MIN_MINUTE = 300
const CHART_MAX_MINUTE = 1200
/** Chart-rendering approximation of array output — slightly above INVERTER_EFFICIENCY, kept distinct deliberately. */
const CHART_GEN_FACTOR = 0.94

export function buildDossier(
  household: DossierHouseholdInput,
  chain: ChainBlock[],
  simMinute: number,
  dayType: DayType,
): DossierViewModel {
  const netValue = household.out - household.draw
  const status = statusForNet(netValue)

  const panelCount = household.pv > 0 ? Math.round(household.pv / 0.4) : 0
  const arrayArea = panelCount ? `${(panelCount * 1.9).toFixed(0)} m²` : '—'
  const inverter = household.pv > 0
    ? `${household.batt > 0 ? 'Hybrid ' : 'String '}${(Math.ceil(household.pv * 2) / 2).toFixed(1)} kW`
    : '—'
  const batteryLabel = household.batt > 0 ? `${household.batt.toFixed(1)} kWh` : 'None'
  const selfConsumedPct = household.gen > 0
    ? Math.max(0, Math.min(100, ((household.gen - household.exp) / household.gen) * 100))
    : 0

  const xFor = (minute: number) =>
    CHART_PAD_LEFT +
    ((minute - CHART_MIN_MINUTE) / (CHART_MAX_MINUTE - CHART_MIN_MINUTE)) * (CHART_WIDTH - CHART_PAD_LEFT - CHART_PAD_RIGHT)

  let peakConsumption = 0
  const genPoints: Array<[number, number]> = []
  const conPoints: Array<[number, number]> = []
  for (let minute = CHART_MIN_MINUTE; minute <= CHART_MAX_MINUTE; minute += 20) {
    const hour = minute / 60
    const consumption = demandCurve(hour, { id: household.id, base: household.base }, dayType)
    if (consumption > peakConsumption) peakConsumption = consumption
    genPoints.push([minute, household.pv * solarCurve(hour, dayType) * CHART_GEN_FACTOR])
    conPoints.push([minute, consumption])
  }
  const scale = Math.max(household.pv, peakConsumption, 1.2) * 1.12
  const yFor = (value: number) => CHART_Y_BASE - Math.min(1, Math.max(0, value / scale)) * (CHART_Y_BASE - CHART_PAD_TOP)

  const genLine = genPoints.map(([m, v]) => `${xFor(m).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')
  const conLine = conPoints.map(([m, v]) => `${xFor(m).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ')
  let areaPath = `M${xFor(CHART_MIN_MINUTE).toFixed(1)},${CHART_Y_BASE}`
  for (const [m, v] of genPoints) areaPath += ` L${xFor(m).toFixed(1)},${yFor(v).toFixed(1)}`
  areaPath += ` L${xFor(CHART_MAX_MINUTE).toFixed(1)},${CHART_Y_BASE} Z`
  const nowX = xFor(Math.max(CHART_MIN_MINUTE, Math.min(CHART_MAX_MINUTE, simMinute))).toFixed(1)

  const activities: DossierActivity[] = chain
    .filter((block) => block.payload.from === household.name || block.payload.to === household.name)
    .slice(-6)
    .reverse()
    .map((block) => {
      const sold = block.payload.from === household.name
      return {
        id: block.id,
        time: block.payload.t,
        direction: sold ? 'SOLD' : 'BOUGHT',
        arrow: sold ? '→' : '←',
        counterparty: sold ? block.payload.to : block.payload.from,
        kwh: block.payload.kwh.toFixed(2),
        credit: `${sold ? '+₹' : '−₹'}${block.payload.credit.toFixed(2)}`,
        invalid: block.invalid,
      }
    })

  const specs: DossierSpec[] = [
    { label: 'System capacity', value: household.pv > 0 ? `${household.pv.toFixed(1)} kW` : '—' },
    { label: 'Panels', value: panelCount ? `${panelCount} × 400 Wp` : '—' },
    { label: 'Array area', value: arrayArea },
    { label: 'Inverter', value: inverter },
    { label: 'Battery', value: batteryLabel },
    { label: 'Orientation', value: household.orient },
    { label: 'Tilt', value: household.pv > 0 ? `${household.tilt}°` : '—' },
    { label: 'Commissioned', value: household.since },
    { label: 'Meter ID', value: `TNEB · ${household.meter}` },
    { label: 'Tariff', value: household.pv > 0 ? 'Prosumer · P2P export' : 'Domestic · LT-1A' },
  ]

  return {
    name: household.name,
    status,
    sub: `${household.pv > 0 ? `${household.pv.toFixed(1)} kW rooftop` : 'No rooftop PV'} · Meter ${household.meter} · Nolambur`,
    out: household.out.toFixed(2),
    draw: household.draw.toFixed(2),
    net: `${netValue >= 0 ? '+' : '−'}${Math.abs(netValue).toFixed(2)}`,
    netPositive: netValue >= 0,
    balance: formatMoney(household.balance),
    now: formatClock(simMinute),
    genLine,
    conLine,
    areaPath,
    nowX,
    ax6: xFor(360).toFixed(1),
    ax12: xFor(720).toFixed(1),
    ax18: xFor(1080).toFixed(1),
    gen: household.gen.toFixed(1),
    con: household.con.toFixed(1),
    exp: household.exp.toFixed(1),
    imp: household.imp.toFixed(1),
    selfNote: household.pv > 0
      ? `SELF-CONSUMED ${selfConsumedPct.toFixed(0)}% OF GENERATION · REST EXPORTED`
      : 'PURE CONSUMER · DRAWS ENTIRELY FROM THE STREET',
    earned: household.earned.toFixed(2),
    spent: household.spent.toFixed(2),
    trades: String(household.trades),
    specs,
    activities,
  }
}
