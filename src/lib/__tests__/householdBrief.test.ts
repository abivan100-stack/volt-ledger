import { describe, expect, it } from 'vitest'
import { buildHouseholdBrief } from '../householdBrief'

describe('buildHouseholdBrief', () => {
  it('keeps the homepage snapshot to live flow, system, and local trade essentials', () => {
    expect(
      buildHouseholdBrief({
        name: 'Asha Kumar',
        pv: 3.6,
        out: 1.2,
        draw: 0.5,
        earned: 42.5,
        spent: 10,
        trades: 3,
      }),
    ).toEqual({
      name: 'Asha Kumar',
      status: 'EXPORTING',
      system: '3.6 kW rooftop solar',
      net: '+0.70 kW',
      netPositive: true,
      out: '1.20 kW',
      draw: '0.50 kW',
      trades: '3 trades',
      netBenefit: '₹32.50',
    })
  })

  it('describes a non-solar household without inventing rooftop capacity', () => {
    const brief = buildHouseholdBrief({
      name: 'Bala',
      pv: 0,
      out: 0,
      draw: 0.65,
      earned: 0,
      spent: 4.5,
      trades: 1,
    })

    expect(brief.status).toBe('IMPORTING')
    expect(brief.system).toBe('Grid-connected home')
    expect(brief.net).toBe('−0.65 kW')
    expect(brief.trades).toBe('1 trade')
    expect(brief.netBenefit).toBe('−₹4.50')
  })
})
