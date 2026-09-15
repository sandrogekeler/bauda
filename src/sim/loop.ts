export const TICK_MS = 100

/**
 * Fixed-timestep deterministic simulation, fully decoupled from rendering. The
 * same step function runs live, during offline catch-up, and in tests.
 */
export class SimLoop {
  tick = 0
  private acc = 0

  constructor(private step: (tick: number) => void) {}

  advance(dtMs: number, maxSteps = 600) {
    this.acc += dtMs
    let n = 0
    while (this.acc >= TICK_MS && n < maxSteps) {
      this.step(this.tick++)
      this.acc -= TICK_MS
      n++
    }
    if (n >= maxSteps) this.acc = 0
    return n
  }

  /** Offline catch-up: bounded iteration, same step function. */
  catchUp(elapsedMs: number, capMs: number): { steps: number; cappedFrom: number } {
    const capped = Math.min(elapsedMs, capMs)
    const steps = Math.floor(capped / TICK_MS)
    const limit = Math.min(steps, 36000)
    for (let i = 0; i < limit; i++) this.step(this.tick++)
    return { steps: limit, cappedFrom: elapsedMs }
  }
}
