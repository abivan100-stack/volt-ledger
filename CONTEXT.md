# Volt Local Energy Ledger

Volt models how a neighbourhood exchanges rooftop-solar energy and records each settlement in a tamper-evident local ledger.

## Language

**Homepage energy-flow map**:
A lightweight overview of which neighbouring homes are currently supplying and drawing local solar. It introduces the exchange without presenting detailed analytics.
_Avoid_: Ledger graph, analytics dashboard, network dashboard

**Producer**:
A household currently supplying surplus rooftop-solar energy to the neighbourhood exchange.
_Avoid_: Generator

**Consumer**:
A household currently drawing energy from the neighbourhood exchange.
_Avoid_: Importer

**Energy flow**:
A recent local transfer from a producing household to a consuming household.
_Avoid_: Connection, wire

## Simulation and access

**Synthetic neighbourhood**:
A fictional collection of households used to explore Volt; it is not a representation of real metering or settled energy data.
_Avoid_: Live neighbourhood, customer site

**Simulation run**:
One reproducible synthetic energy scenario defined by a model version, an input snapshot, and a seed.
_Avoid_: Live reading, forecast

**Interval energy**:
The kWh generated, consumed, imported, or exported during a defined time interval.
_Avoid_: Instantaneous energy, kW reading

**Simulation outcome**:
A P10, P50, P90, or selected-sample result produced by a synthetic simulation run; it is not a forecast or meter reading.
_Avoid_: Prediction, actual result

**Simulation sample**:
One independently seeded synthetic scenario within a simulation run used to calculate its outcome bands.
_Avoid_: Live sample, meter sample

**Estimated credit**:
An illustrative rupee value calculated from synthetic interval energy and a configured community rate; it is not a payment obligation.
_Avoid_: Earnings, money owed

**Organisation**:
The group that owns a synthetic neighbourhood and its Volt configuration.
_Avoid_: Account, tenant

**Membership**:
A user's role-bound relationship to one organisation.
_Avoid_: User role, admin flag

**Organisation invitation**:
A time-limited request for a person to join one organisation with a specified role; it becomes a Membership only after the invited person accepts it.
_Avoid_: Pending membership, access token

**Owner**:
The membership role accountable for an organisation's ownership and destructive administrative actions.
_Avoid_: Super admin, root user

**Admin**:
The membership role that manages organisation access and Volt configuration.
_Avoid_: Global admin

**Operator**:
The membership role that creates and runs simulations without managing organisation access.
_Avoid_: Editor

**Viewer**:
The membership role that may inspect an organisation's saved Volt data but cannot change it.
_Avoid_: Read-only user

**Demo session**:
A non-persistent public exploration of a prebuilt synthetic neighbourhood.
_Avoid_: Anonymous account, trial account

**Ledger event**:
An immutable, server-recorded event in Volt's tamper-evident settlement history.
_Avoid_: Editable transaction, ledger row

**Canonical seal**:
The server-generated cryptographic link for a ledger event, including the accepted simulation result digest.
_Avoid_: Client hash, browser seal

**Settlement**:
The daily, per-household energy total accepted from a completed simulation run and recorded as a ledger event.

Settlement acceptance is an owner/admin action. It records the chosen Monte Carlo outcome and uses that outcome's
`exportedKwh` and `estimatedCreditInr`; these are synthetic estimates, not meter readings or payments.
_Avoid_: Interval trade, live payment
