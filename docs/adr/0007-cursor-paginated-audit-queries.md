# Cursor-paginated audit queries

Organisation audit history is exposed as a bounded, owner/admin-readable stream. Queries support an optional action filter and an opaque cursor ordered by descending creation time and event ID. The API returns a `nextCursor` only when another page exists; cursors encode no authorization data and are valid only as position markers. Audit events remain retained for provenance, including after an organisation is archived.
