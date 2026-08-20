# Email-backed organisation invitations

Volt will represent an invitation separately from a membership. An invitation names an organisation, a target role, and an invited email address, and expires after a short period. Only a hash of its single-use acceptance token is persisted; acceptance requires an authenticated user whose verified email matches the invitation. Owner transfer is not part of invitation acceptance and remains a separate administrative action.

This keeps pending access revocable and auditable without granting organisation access before the recipient proves control of the invited email address.
