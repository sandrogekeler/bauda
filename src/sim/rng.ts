/**
 * All randomness is seeded and reproducible. Determinism is a hard requirement:
 * it is what makes offline simulation, duel replays and seed sharing possible,
 * and it makes balance testable (features.md section 13).
 */
export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0 || 1
  }

  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo)
  }

  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1))
  }

  get state(): number {
    return this.s
  }

  set state(v: number) {
    this.s = v >>> 0
  }
}
