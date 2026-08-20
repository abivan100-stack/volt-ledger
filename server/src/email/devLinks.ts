import { env } from '../config/env.js'

/**
 * Outbound action links, echoed to the server console outside production.
 *
 * Verification and invitation links only work if they reach a person, and in
 * local development they routinely do not: the URL points at `localhost`, which
 * is a phishing signature, so mail providers file the message as spam even when
 * the provider reports it delivered. Waiting on an inbox that will never show it
 * is not a workable loop, so the link is printed where the developer already is.
 *
 * Announced before the send is attempted, so a misconfigured or failing mail
 * provider still leaves a usable link.
 *
 * Never in production. The URL carries a signed token that grants the action it
 * names, which makes it a credential, and credentials do not belong in logs.
 */

export type LinkSink = (message: string) => void

export interface AnnounceLinkOptions {
  nodeEnv?: string
  sink?: LinkSink
}

export function shouldAnnounceLinks(nodeEnv: string): boolean {
  return nodeEnv !== 'production'
}

export function formatLinkAnnouncement(label: string, to: string, url: string): string {
  return ['', `  ${label}`, `  to:   ${to}`, `  open: ${url}`, ''].join('\n')
}

export function announceLink(
  label: string,
  to: string,
  url: string,
  options: AnnounceLinkOptions = {},
): void {
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV
  if (!shouldAnnounceLinks(nodeEnv)) return

  const sink = options.sink ?? ((message: string) => console.info(message))
  sink(formatLinkAnnouncement(label, to, url))
}
