# Server-owned append-only settlements

Completed simulation runs will create immutable, daily per-household settlement events in a server-owned hash-linked ledger, and every event will bind an accepted simulation-result digest. Corrections are represented by subsequent adjustment events, not updates to accepted events, so persisted audit history remains trustworthy beyond the client application.
