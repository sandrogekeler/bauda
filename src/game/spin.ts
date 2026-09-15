import { Rng } from '../sim/rng'
import { SYMBOL_BY_ID, type SymbolDef } from './symbols'

export interface SpinResult {
  total: number
  perSlot: number[]
  /** Slots consumed by a DEVOUR this spin. */
  devoured: boolean[]
  /** Slots where a CHANCE effect fired. */
  crit: boolean[]
}

/** 8-neighbourhood, like the slot machines this is modelled on. */
function neighbours(i: number, width: number, len: number): number[] {
  const x = i % width
  const y = Math.floor(i / width)
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || nx >= width || ny < 0) continue
      const ni = ny * width + nx
      if (ni < 0 || ni >= len) continue
      out.push(ni)
    }
  }
  return out
}

/**
 * Resolves one spin of a machine.
 *
 * Order is fixed and documented because it is the difference between a build
 * that works and a build that does not: additive effects land before
 * multiplicative ones, so a x2 applies to the boosted value, and the player can
 * reason about it. Randomness is drawn from a seeded Rng, so a spin is
 * reproducible - required for offline catch-up and replays.
 */
export function resolveSpin(
  slots: (string | null)[],
  growth: number[],
  width: number,
  rng: Rng,
  luckBonus = 0,
): SpinResult {
  const n = slots.length
  const defs: (SymbolDef | null)[] = slots.map((id) => (id ? SYMBOL_BY_ID.get(id) ?? null : null))
  const value = new Array<number>(n).fill(0)
  const devoured = new Array<boolean>(n).fill(false)
  const crit = new Array<boolean>(n).fill(false)

  for (let i = 0; i < n; i++) {
    if (defs[i]) value[i] = defs[i]!.base + (growth[i] ?? 0)
  }

  // 1. devour: consumes a neighbour, so it must run before anything reads values
  for (let i = 0; i < n; i++) {
    const e = defs[i]?.effect
    if (e?.kind !== 'DEVOUR') continue
    for (const j of neighbours(i, width, n)) {
      if (!defs[j] || devoured[j] || j === i) continue
      if (!defs[j]!.tags.includes(e.tag)) continue
      devoured[j] = true
      value[j] = 0
      value[i] += e.gain
      break
    }
  }

  // 2. additive effects, all computed against the original layout
  for (let i = 0; i < n; i++) {
    const d = defs[i]
    if (!d || devoured[i]) continue
    const e = d.effect
    if (!e) continue
    if (e.kind === 'ADD_ADJ') {
      for (const j of neighbours(i, width, n)) {
        if (!defs[j] || devoured[j]) continue
        if (e.tag && !defs[j]!.tags.includes(e.tag)) continue
        value[j] += e.amount
      }
    } else if (e.kind === 'ADD_PER_ADJ') {
      let c = 0
      for (const j of neighbours(i, width, n)) {
        if (!defs[j] || devoured[j]) continue
        if (defs[j]!.tags.includes(e.tag)) c++
      }
      value[i] += e.amount * c
    }
  }

  // 3. the gamble, on the boosted value
  for (let i = 0; i < n; i++) {
    const e = defs[i]?.effect
    if (e?.kind !== 'CHANCE' || devoured[i]) continue
    if (rng.next() < Math.min(0.95, e.p + luckBonus)) {
      value[i] *= e.factor
      crit[i] = true
    }
  }

  // 4. multiplicative effects
  const mult = new Array<number>(n).fill(1)
  for (let i = 0; i < n; i++) {
    const d = defs[i]
    if (!d || devoured[i]) continue
    const e = d.effect
    if (!e) continue
    if (e.kind === 'MULT_ADJ') {
      for (const j of neighbours(i, width, n)) {
        if (!defs[j] || devoured[j]) continue
        if (e.tag && !defs[j]!.tags.includes(e.tag)) continue
        mult[j] *= e.factor
      }
    } else if (e.kind === 'MULT_PER_ADJ') {
      let c = 0
      for (const j of neighbours(i, width, n)) {
        if (!defs[j] || devoured[j]) continue
        if (defs[j]!.tags.includes(e.tag)) c++
      }
      mult[i] *= Math.pow(e.factor, c)
    } else if (e.kind === 'MULT_ROW') {
      const row = Math.floor(i / width)
      for (let j = 0; j < n; j++) {
        if (Math.floor(j / width) !== row || devoured[j]) continue
        mult[j] *= e.factor
      }
    }
  }

  let total = 0
  const perSlot = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    perSlot[i] = value[i] * mult[i]
    total += perSlot[i]
  }

  // 5. whole-machine multipliers
  for (let i = 0; i < n; i++) {
    const e = defs[i]?.effect
    if (e?.kind === 'MULT_ALL' && !devoured[i]) total *= e.factor
  }

  return { total, perSlot, devoured, crit }
}

/** GROW symbols accumulate between spins; call once per resolved spin. */
export function applyGrowth(slots: (string | null)[], growth: number[]) {
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i]
    if (!id) continue
    const e = SYMBOL_BY_ID.get(id)?.effect
    if (e?.kind === 'GROW') growth[i] = (growth[i] ?? 0) + e.amount
  }
}
