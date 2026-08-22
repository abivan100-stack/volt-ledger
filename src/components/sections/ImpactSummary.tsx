import { useMemo } from 'react'
import { fairnessSummary } from '../../lib/fairness'
import {
  GRID_BUYBACK_RATE_INR_PER_KWH,
  GRID_RETAIL_RATE_INR_PER_KWH,
  impactSummary,
} from '../../lib/impact'
import { formatMoney } from '../../lib/format'
import { useEnergyStore } from '../../store/useEnergyStore'
import './ImpactSummary.css'

/** A compact, evidence-backed explanation of why the simulated exchange matters. */
function ImpactSummary() {
  const totalKwh = useEnergyStore((state) => state.totalKwhToday)
  const totalCredit = useEnergyStore((state) => state.totalCreditToday)
  const dailyBreakdown = useEnergyStore((state) => state.dailyBreakdown)
  const households = useEnergyStore((state) => state.households)
  const chainLength = useEnergyStore((state) => state.chain.length)

  const impact = useMemo(
    () => impactSummary({ totalKwh, totalCredit, dailyBreakdown }),
    [totalKwh, totalCredit, dailyBreakdown],
  )
  const fairness = useMemo(() => fairnessSummary(households), [households])

  return (
    <section data-reveal className="impact-summary" aria-labelledby="impact-summary-title">
      <div className="impact-summary-heading">
        <div>
          <p className="eyebrow impact-summary-label">Impact summary</p>
          <h2 id="impact-summary-title" className="serif impact-summary-title">
            The case for Volt, <em>in this scenario.</em>
          </h2>
        </div>
        <p className="mono impact-summary-proof">
          {chainLength} SHA-256 SEALED {chainLength === 1 ? 'RECORD' : 'RECORDS'}
        </p>
      </div>

      <div className="impact-summary-grid">
        <ImpactMetric
          label="Settled locally"
          value={formatMoney(impact.communitySettlementInr)}
          caption={`${totalKwh.toFixed(2)} kWh exchanged on the street`}
        />
        <ImpactMetric
          label="Seller uplift"
          value={formatMoney(impact.sellerUpliftInr)}
          caption={`Versus ₹${GRID_BUYBACK_RATE_INR_PER_KWH.toFixed(2)}/kWh grid buyback`}
        />
        <ImpactMetric
          label="Buyer saving"
          value={formatMoney(impact.buyerSavingInr)}
          caption={`Versus ₹${GRID_RETAIL_RATE_INR_PER_KWH.toFixed(2)}/kWh grid retail`}
        />
        <ImpactMetric
          label="Carbon avoided"
          value={`${impact.carbonAvoidedKg.toFixed(1)} kg`}
          caption="Local trade instead of grid draw"
        />
        <ImpactMetric
          label="Grid-free demand"
          value={`${impact.autonomyPct.toFixed(0)}%`}
          caption="Solar, battery, and neighbour exchange"
        />
        <ImpactMetric
          label="Benefit range"
          value={formatMoney(fairness.spread)}
          caption="Best-to-worst household benefit today"
        />
      </div>

      <p className="impact-summary-note">
        Illustrative synthetic scenario only. Value comparisons use the stated grid benchmarks; every settled figure above comes from the current ledger.
      </p>
    </section>
  )
}

interface ImpactMetricProps {
  label: string
  value: string
  caption: string
}

function ImpactMetric({ label, value, caption }: ImpactMetricProps) {
  return (
    <div className="impact-summary-metric">
      <div className="mono impact-summary-metric-label">{label}</div>
      <div className="mono impact-summary-metric-value">{value}</div>
      <div className="mono impact-summary-metric-caption">{caption}</div>
    </div>
  )
}

export default ImpactSummary
