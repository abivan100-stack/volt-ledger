import { useState } from 'react'
import { calculateCommunityRoi, type RoiCalculatorInput } from '../../lib/roiCalculator'
import SectionHeading from '../ui/SectionHeading'
import './CommunityRoiCalculator.css'

function CommunityRoiCalculator() {
  const [bill, setBill] = useState<number>(3500)
  const [roofArea, setRoofArea] = useState<number>(30)
  const [p2pShare, setP2pShare] = useState<number>(40)

  const input: RoiCalculatorInput = {
    monthlyBillInr: bill,
    roofAreaM2: roofArea,
    p2pSharePercent: p2pShare,
  }

  const output = calculateCommunityRoi(input)

  return (
    <section id="calculator" className="roi-calculator-section">
      <div className="container roi-calculator-container">
        <SectionHeading kicker="03" label="Economics" />
        <h2 className="serif roi-calculator-heading">
          What if <em>your</em> house joined?
        </h2>
        <p className="roi-calculator-intro">
          Estimate your household's solar payback and peer-to-peer trading revenue under the PM Surya Ghar
          rooftop subsidy and Tamil Nadu residential microgrid rates.
        </p>

        <div className="roi-calculator-grid">
          {/* Sliders Form Card */}
          <div className="roi-calculator-form">
            <h3 className="mono roi-form-title">YOUR HOUSEHOLD PROFILE</h3>

            <div className="roi-field">
              <div className="roi-field-header">
                <label htmlFor="roi-bill" className="mono roi-field-label">
                  MONTHLY ELECTRICITY BILL
                </label>
                <span className="mono roi-field-val">₹{bill.toLocaleString('en-IN')}</span>
              </div>
              <input
                id="roi-bill"
                type="range"
                min={1500}
                max={15000}
                step={500}
                value={bill}
                onChange={(e) => setBill(Number(e.target.value))}
                className="roi-slider"
                aria-valuemin={1500}
                aria-valuemax={15000}
                aria-valuenow={bill}
              />
              <div className="mono roi-field-hint">
                ~{output.estimatedMonthlyKwh} kWh / month based on TANGEDCO LT-1A slabs
              </div>
            </div>

            <div className="roi-field">
              <div className="roi-field-header">
                <label htmlFor="roi-roof" className="mono roi-field-label">
                  USABLE ROOFTOP SPACE
                </label>
                <span className="mono roi-field-val">
                  {roofArea === 0 ? '0 m² (Renter / Tenant)' : `${roofArea} m² (~${Math.round(roofArea * 10.76)} sq ft)`}
                </span>
              </div>
              <input
                id="roi-roof"
                type="range"
                min={0}
                max={100}
                step={5}
                value={roofArea}
                onChange={(e) => setRoofArea(Number(e.target.value))}
                className="roi-slider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={roofArea}
              />
              <div className="mono roi-field-hint">
                {roofArea === 0 ? 'No roof access? You can still buy clean solar from peers.' : `Fits up to ${(roofArea / 6.5).toFixed(1)} kW Solar PV`}
              </div>
            </div>

            {!output.isRenter && (
              <div className="roi-field">
                <div className="roi-field-header">
                  <label htmlFor="roi-share" className="mono roi-field-label">
                    SURPLUS SHARED WITH NEIGHBOURS
                  </label>
                  <span className="mono roi-field-val">{p2pShare}%</span>
                </div>
                <input
                  id="roi-share"
                  type="range"
                  min={20}
                  max={80}
                  step={5}
                  value={p2pShare}
                  onChange={(e) => setP2pShare(Number(e.target.value))}
                  className="roi-slider"
                  aria-valuemin={20}
                  aria-valuemax={80}
                  aria-valuenow={p2pShare}
                />
                <div className="mono roi-field-hint">
                  Sold peer-to-peer at ₹5.50/kWh vs ₹3.10 DISCOM feed-in credit
                </div>
              </div>
            )}
          </div>

          {/* Results Output Card */}
          <div className="roi-calculator-results">
            {output.isRenter ? (
              <div className="roi-renter-box">
                <div className="mono roi-renter-tag">APARTMENT / TENANT MODE</div>
                <h4 className="serif roi-renter-title">Save money without installing panels.</h4>
                <p className="roi-renter-desc">
                  You don't own a roof, but with Volt you can purchase clean solar power directly from your
                  neighbours at ₹5.50/kWh instead of paying higher peak grid rates (~₹6.50–₹9.00/kWh).
                </p>
                <div className="roi-renter-stats">
                  <div className="roi-stat-cell">
                    <span className="mono roi-stat-label">ANNUAL SAVINGS</span>
                    <span className="mono roi-stat-value roi-stat-sun">
                      +₹{output.annualGridSavingsInr.toLocaleString('en-IN')}
                    </span>
                    <span className="mono roi-stat-sub">~28% saved on power bills</span>
                  </div>
                  <div className="roi-stat-cell">
                    <span className="mono roi-stat-label">CARBON AVOIDED</span>
                    <span className="mono roi-stat-value">{output.annualCo2Kg.toLocaleString('en-IN')} kg</span>
                    <span className="mono roi-stat-sub">≈ {output.treesEquivalent} trees planted</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="roi-prosumer-box">
                <div className="roi-highlight-banner">
                  <div className="roi-highlight-col">
                    <span className="mono roi-highlight-label">RECOMMENDED SYSTEM</span>
                    <span className="serif roi-highlight-value">{output.recommendedKw.toFixed(1)} kW</span>
                    <span className="mono roi-highlight-sub">
                      Generates ~{output.annualGenerationKwh.toLocaleString('en-IN')} kWh / yr
                    </span>
                  </div>
                  <div className="roi-highlight-col">
                    <span className="mono roi-highlight-label">ESTIMATED PAYBACK</span>
                    <span className="serif roi-highlight-value roi-stat-sun">
                      {output.paybackYears.toFixed(1)} yrs
                    </span>
                    <span className="mono roi-highlight-sub">
                      vs 6.5 yrs with standard DISCOM
                    </span>
                  </div>
                </div>

                <div className="roi-breakdown-grid">
                  <div className="roi-breakdown-row">
                    <span className="mono roi-breakdown-label">Gross System Cost</span>
                    <span className="mono roi-breakdown-val">₹{output.grossSystemCostInr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="roi-breakdown-row">
                    <span className="mono roi-breakdown-label">PM Surya Ghar Subsidy</span>
                    <span className="mono roi-breakdown-val roi-stat-sun">−₹{output.subsidyInr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="roi-breakdown-row roi-breakdown-net">
                    <span className="mono roi-breakdown-label">Net Out-of-Pocket</span>
                    <span className="mono roi-breakdown-val">₹{output.netInvestmentInr.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="roi-breakdown-row">
                    <span className="mono roi-breakdown-label">Avoided Grid Purchase</span>
                    <span className="mono roi-breakdown-val">+₹{output.annualGridSavingsInr.toLocaleString('en-IN')} / yr</span>
                  </div>
                  <div className="roi-breakdown-row">
                    <span className="mono roi-breakdown-label">Peer-to-Peer Export Revenue</span>
                    <span className="mono roi-breakdown-val roi-stat-sun">+₹{output.annualP2pEarningsInr.toLocaleString('en-IN')} / yr</span>
                  </div>
                  <div className="roi-breakdown-row roi-breakdown-total">
                    <span className="mono roi-breakdown-label">NET ANNUAL BENEFIT</span>
                    <span className="mono roi-breakdown-val roi-stat-sun">+₹{output.netAnnualBenefitInr.toLocaleString('en-IN')} / yr</span>
                  </div>
                </div>

                <div className="roi-carbon-strip">
                  <span className="mono roi-carbon-text">
                    🌱 {output.annualCo2Kg.toLocaleString('en-IN')} kg CO₂ avoided annually · Equivalent to {output.treesEquivalent} trees
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default CommunityRoiCalculator
