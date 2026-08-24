/*
 * Emissions avoided by settling energy peer-to-peer instead of drawing the
 * same kWh from the grid. This is an avoided-emissions figure, not a
 * total-emissions or net-zero claim — it says nothing about emissions
 * embodied in manufacturing the panels, wiring, or the rest of the grid.
 */

/**
 * India grid average emissions intensity, kg CO2 per kWh. Source: Central
 * Electricity Authority (CEA) CO2 Baseline Database, national grid average
 * ≈ 0.71 kg CO2/kWh. Swap this one constant to model a different grid.
 */
export const GRID_EMISSIONS_FACTOR_KG_PER_KWH = 0.71

/**
 * Average tailpipe emissions of a small petrol car, kg CO2 per km — used only
 * for a human-scale equivalence, not a precision conversion.
 */
export const CAR_EMISSIONS_KG_PER_KM = 0.12

/** kg CO2 avoided by trading `kwhTradedLocally` kWh locally instead of via the grid. */
export function carbonAvoidedKg(kwhTradedLocally: number): number {
  if (!Number.isFinite(kwhTradedLocally)) return 0
  return kwhTradedLocally * GRID_EMISSIONS_FACTOR_KG_PER_KWH
}

/** Km of petrol-car driving `kgCo2Avoided` kg of CO2 is roughly equivalent to. */
export function carAvoidedKm(kgCo2Avoided: number): number {
  if (!Number.isFinite(kgCo2Avoided)) return 0
  return kgCo2Avoided / CAR_EMISSIONS_KG_PER_KM
}
