import dns from 'node:dns'

/**
 * Optional DNS override for the integration suite.
 *
 * Some sandboxed and corporate environments refuse Node's system resolver, which
 * makes a `mongodb+srv://` URI fail at the SRV lookup before any connection is
 * attempted. Setting `VOLT_TEST_DNS_SERVERS` to a comma-separated list of
 * resolvers works around that.
 *
 * Applied from `connectTestDatabase` rather than a vitest setup file, so it is
 * guaranteed to run in the same thread as the driver and before the client is
 * constructed. Does nothing when the variable is unset.
 */
export function applyTestDnsServers(
  environment: NodeJS.ProcessEnv = process.env,
): string[] | null {
  const configured = environment.VOLT_TEST_DNS_SERVERS
  if (!configured) return null

  const servers = configured
    .split(',')
    .map((server) => server.trim())
    .filter((server) => server.length > 0)

  if (servers.length === 0) return null

  dns.setServers(servers)
  return servers
}
