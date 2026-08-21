import dns from 'node:dns'

/**
 * Applies an optional DNS resolver override before a MongoDB client is created.
 *
 * This is an opt-in escape hatch for machines whose system resolver cannot look
 * up MongoDB Atlas SRV records. It leaves the operating-system resolver in use
 * when the setting is absent or blank.
 */
export function applyDnsServers(configured?: string): string[] | null {
  if (!configured) return null

  const servers = configured
    .split(',')
    .map((server) => server.trim())
    .filter((server) => server.length > 0)

  if (servers.length === 0) return null

  dns.setServers(servers)
  return servers
}
