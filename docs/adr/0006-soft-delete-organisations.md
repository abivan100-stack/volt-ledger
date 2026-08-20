# Soft-delete organisations

An organisation owner may archive an organisation through the REST API. The operation runs in one MongoDB transaction, marks the organisation, active memberships, invitations, simulation runs, intervals, and summaries as deleted, and revokes pending invitations. Immutable ledger and audit history remains retained for provenance, while active access is removed.
