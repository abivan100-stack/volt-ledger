export interface ApiListenConfig {
  apiHost: string
  apiPort: number
  renderPort?: number
}

/**
 * Render injects PORT and requires public web services to bind to all
 * interfaces. Local development keeps the explicit API host and port.
 */
export function resolveApiListenAddress(config: ApiListenConfig): { host: string; port: number } {
  if (config.renderPort !== undefined) {
    return { host: '0.0.0.0', port: config.renderPort }
  }

  return { host: config.apiHost, port: config.apiPort }
}
