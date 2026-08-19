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
