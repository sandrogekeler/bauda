import type { Tier } from '../render/tiers'

const BOOT_LINES = [
  'BAUDA/OS  v0.2',
  '',
  'UPLINK .............. NEGOTIATING',
  'CARRIER ............. DETECTED',
  'SYNDICATE LEDGER .... AUTHORISED',
  'DISTRICT MAP ........ NEON FLATS',
  '',
  'WELCOME BACK, OPERATOR.',
]

/**
 * The boot sequence, and the character crawl that sells the low-baud tiers.
 *
 * The crawl is scoped to this screen and to new log lines. Applying it to the
 * whole interface would be faithful to 300 baud and miserable to use.
 */
export class Boot {
  private started = 0
  done = false

  constructor(private skippable = true) {}

  start(now: number) {
    this.started = now
    this.done = false
  }

  skip() {
    if (this.skippable) this.done = true
  }

  /** Lines revealed so far, the last one partially. */
  visible(now: number, tier: Tier): string[] {
    const elapsed = (now - this.started) / 1000
    // Floor the rate so tier 0 still finishes in a couple of seconds.
    const budget = Math.max(90, tier.cps) * elapsed
    const out: string[] = []
    let used = 0
    for (const line of BOOT_LINES) {
      const cost = Math.max(line.length, 6)
      if (used + cost <= budget) {
        out.push(line)
        used += cost
        continue
      }
      const chars = Math.max(0, Math.floor(budget - used))
      out.push(line.slice(0, chars))
      return out
    }
    this.done = true
    return out
  }
}

/** Visible prefix of a line being revealed, for the log crawl. */
export function crawl(text: string, ageSeconds: number, cps: number): string {
  if (cps > 20000) return text
  const n = Math.floor(ageSeconds * cps)
  return n >= text.length ? text : text.slice(0, n)
}
