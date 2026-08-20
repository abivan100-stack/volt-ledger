# Expired invitation maintenance

The simulation worker periodically revokes pending organisation invitations whose expiry time has passed. The update is idempotent, preserves the invitation document and its token hash for history, and never affects accepted, already revoked, or soft-deleted invitations. Maintenance runs once on worker startup and then no more frequently than the configured interval; simulation processing remains a separate queue operation.
