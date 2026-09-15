import { Game, UPGRADES, upgradeCost } from '../game/state'
import { UNIT_BY_ID, UNITS } from '../game/units'
import { TICK_MS } from '../sim/loop'

export interface Milestones {
  seed: number
  minutes: number
  /** Simulated minutes at which each milestone was first reached. */
  firstPayout: number | null
  /** When a Cashout first became possible, not when the bot took it. */
  cashoutAvailable: number | null
  cash1k: number | null
  firstCashout: number | null
  firstTier: number | null
  tier2: number | null
  /** Total cash earned by the end. */
  totalCash: number
  income: number
  units: number
  chips: number
  cashouts: number
  draws: number
  peakHeat: number
  meltdowns: number
  /** RNG state at the end - two identical runs must agree. */
  rngState: number
}

/**
 * A crude but consistent simulated player, used to check the pacing targets in
 * features.md section 8. It is not trying to play well - it is trying to play
 * the same way every time, so that a balance change shows up as a moved
 * milestone rather than as noise.
 */
export function autoplay(seed: number, minutes: number): Milestones {
  const g = new Game(seed)
  g.cash = 40

  const m: Milestones = {
    seed, minutes,
    firstPayout: null, cashoutAvailable: null, cash1k: null, firstCashout: null, firstTier: null, tier2: null,
    totalCash: 0, income: 0, units: 0, chips: 0, cashouts: 0, draws: 0,
    peakHeat: 0, meltdowns: 0, rngState: 0,
  }

  const totalSteps = Math.round((minutes * 60 * 1000) / TICK_MS)
  const stepsPerSecond = Math.round(1000 / TICK_MS)
  let placedCount = 0
  let lastHeat = 0

  const spot = (i: number): [number, number] => {
    // Loose spiral: keeps buildings apart without pretending to be good at
    // layout, so aura overlap stays realistic rather than optimal.
    const a = i * 2.39996
    const r = 2.8 + Math.sqrt(i) * 2.3
    return [Math.cos(a) * r, Math.sin(a) * r]
  }

  for (let step = 0; step < totalSteps; step++) {
    g.step()

    if (g.heat > m.peakHeat) m.peakHeat = g.heat
    if (lastHeat < 0.96 && g.heat >= 0.96) m.meltdowns++
    lastHeat = g.heat

    const minute = (step * TICK_MS) / 60000
    if (m.firstPayout === null && g.totalCash > 0) m.firstPayout = minute
    if (m.cash1k === null && g.totalCash >= 1000) m.cash1k = minute
    if (m.cashoutAvailable === null && g.cashoutChips() > 0) m.cashoutAvailable = minute

    if (step % stepsPerSecond !== 0) continue

    // Buy the most expensive affordable unlocked unit, leaving a buffer so the
    // player is not permanently broke - roughly how a real player behaves.
    if (g.units.length < 26) {
      const affordable = UNITS
        .filter((u) => g.totalCash >= u.unlockAt && g.cash >= g.costOf(u) * 1.6)
        .sort((a, b) => g.costOf(b) - g.costOf(a))[0]
      if (affordable) {
        const [x, z] = spot(placedCount++)
        if (g.place(affordable, x, z, 0)) {
          // A support building every few units, to keep auras in the picture.
        }
      }
    }

    // Draw symbols with spare cash and install them wherever there is room.
    if (g.cash > g.drawCost() * 4) {
      const id = g.draw()
      if (id) {
        outer: for (const u of g.units) {
          const def = UNIT_BY_ID.get(u.defId)!
          for (let i = 0; i < def.slots; i++) {
            if (!u.slots[i]) { g.install(u, i, id); break outer }
          }
        }
      }
    }

    // Cash out once it is clearly worth it, then spend chips on the cheapest
    // upgrade available.
    if (g.cashoutChips() >= Math.max(6, g.chips * 0.6)) {
      const n = g.cashout()
      if (n > 0) {
        placedCount = 0
        if (m.firstCashout === null) m.firstCashout = minute
      }
    }
    for (let i = 0; i < 4; i++) {
      const best = UPGRADES
        .filter((u) => g.upgrades[u.id] < u.max)
        .sort((a, b) => upgradeCost(g.upgrades[a.id]) - upgradeCost(g.upgrades[b.id]))[0]
      if (!best || g.chips < upgradeCost(g.upgrades[best.id])) break
      g.buyUpgrade(best.id)
    }

    if (g.buyTier()) {
      if (m.firstTier === null) m.firstTier = minute
      if (g.tier >= 2 && m.tier2 === null) m.tier2 = minute
    }
  }

  m.totalCash = g.totalCash
  m.income = g.income()
  m.units = g.units.length
  m.chips = g.chips
  m.cashouts = g.cashouts
  m.draws = g.draws
  m.rngState = g.rng.state
  return m
}
