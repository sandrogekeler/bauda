import { Rng } from '../sim/rng'
import { TICK_MS } from '../sim/loop'
import { applyGrowth, resolveSpin } from './spin'
import { RARITY_WEIGHT, SYMBOLS, SYMBOL_BY_ID, type Rarity } from './symbols'
import { UNITS, UNIT_BY_ID, unitCost, type AuraKind, type UnitDef } from './units'

export interface Unit {
  id: number
  defId: string
  x: number
  z: number
  rot: number
  slots: (string | null)[]
  growth: number[]
  /** Seconds accumulated toward the next spin. */
  accum: number
  lastPayout: number
  /** Cached aura sums; recomputed only when the layout changes. */
  aura: AuraSums
}

export type AuraSums = Record<AuraKind, number>

export type UpgradeId = 'YIELD' | 'AURA' | 'RATE' | 'OFFLINE' | 'CAP'

export interface Upgrade {
  id: UpgradeId
  name: string
  note: string
  max: number
}

export const UPGRADES: Upgrade[] = [
  { id: 'YIELD', name: 'YIELD', note: '+22% payout', max: 40 },
  { id: 'AURA', name: 'RANGE', note: '+9% aura radius', max: 25 },
  { id: 'RATE', name: 'RATE', note: '+7% spin rate', max: 25 },
  { id: 'OFFLINE', name: 'NIGHT', note: '+8% offline rate', max: 20 },
  { id: 'CAP', name: 'BUFFER', note: '+2h offline cap', max: 20 },
]

/** Cash a new run starts with. Without it a Cashout is unrecoverable. */
export const SEED_STAKE = 40

export function upgradeCost(level: number): number {
  return Math.ceil(Math.pow(1.42, level))
}

/** Bandwidth is granted at lifetime-cash milestones, plus one per Cashout. */
export const BANDWIDTH_MILESTONES = [600, 4_000, 20_000, 120_000, 900_000]

/** Uplink tier costs in Bandwidth. Phase 1 ships tiers 0-2. */
export const TIER_COST = [0, 1, 2, 4, 8, 16]

export interface HeatBand {
  name: string
  from: number
  mult: number
  color: number
}

/** features.md section 5. Payout scales with risk; the top band is a decision. */
export const HEAT_BANDS: HeatBand[] = [
  { name: 'COLD', from: 0.0, mult: 1.0, color: 5 },
  { name: 'WARM', from: 0.26, mult: 1.4, color: 1 },
  { name: 'HOT', from: 0.51, mult: 2.2, color: 2 },
  { name: 'CRITICAL', from: 0.76, mult: 4.0, color: 3 },
  { name: 'MELTDOWN', from: 0.96, mult: 8.0, color: 3 },
]

export function heatBand(heat: number): HeatBand {
  let b = HEAT_BANDS[0]
  for (const band of HEAT_BANDS) if (heat >= band.from) b = band
  return b
}

export interface LogLine {
  tick: number
  text: string
  color: number
}

export class Game {
  tick = 0
  cash = 0
  /** Since the last Cashout. Drives the Chip formula. */
  lifetimeCash = 0
  /** All time, across Cashouts. Drives unlocks and Bandwidth. */
  totalCash = 0
  chips = 0
  bandwidth = 0
  cashouts = 0
  tier = 0
  phosphor = 0
  heat = 0
  units: Unit[] = []
  inventory: Record<string, number> = {}
  upgrades: Record<UpgradeId, number> = { YIELD: 0, AURA: 0, RATE: 0, OFFLINE: 0, CAP: 0 }
  bankedPulls = 0
  draws = 0
  seed: number
  rng: Rng
  /** Tick at which a meltdown's grace window ends. */
  meltdownUntil = 0
  /** Tick until which the district is shut down after a meltdown. */
  shutdownUntil = 0
  log: LogLine[] = []
  private nextId = 1

  constructor(seed = 0x5eed) {
    this.seed = seed
    this.rng = new Rng(seed)
  }

  // --- derived --------------------------------------------------------------

  get yieldMult(): number {
    return Math.pow(1.22, this.upgrades.YIELD) * (1 + this.chips * 0.04)
  }

  get auraRangeMult(): number {
    return 1 + this.upgrades.AURA * 0.09
  }

  get rateMult(): number {
    return 1 + this.upgrades.RATE * 0.07
  }

  get offlineRate(): number {
    return Math.min(1.5, 0.5 + this.upgrades.OFFLINE * 0.08)
  }

  get offlineCapMs(): number {
    return (4 + this.upgrades.CAP * 2) * 3600 * 1000
  }

  get unlockedUnits(): UnitDef[] {
    return UNITS.filter((u) => this.totalCash >= u.unlockAt)
  }

  owned(defId: string): number {
    return this.units.reduce((n, u) => n + (u.defId === defId ? 1 : 0), 0)
  }

  costOf(def: UnitDef): number {
    return unitCost(def, this.owned(def.id))
  }

  /** Minimum run earnings before a Cashout is offered at all. */
  static readonly CASHOUT_FLOOR = 60_000
  /** Divisor in the Chip formula. Separate from the gate so the two can be
   *  tuned independently - raising the gate should not also cut Chip yield. */
  static readonly CHIP_BASE = 25_000

  /**
   * Chips a Cashout would pay right now. Sub-linear in run earnings, so a
   * longer run is worth more but never so much that resetting stops being
   * attractive - the exponent is what sets the whole prestige cadence.
   */
  cashoutChips(): number {
    if (this.lifetimeCash < Game.CASHOUT_FLOOR) return 0
    return Math.floor(3 * Math.pow(this.lifetimeCash / Game.CHIP_BASE, 0.45))
  }

  income(): number {
    let total = 0
    for (const u of this.units) {
      const def = UNIT_BY_ID.get(u.defId)!
      if (def.slots === 0) continue
      total += this.expectedPayout(u) / this.period(u)
    }
    return total
  }

  // --- layout ---------------------------------------------------------------

  place(def: UnitDef, x: number, z: number, rot: number, free = false): Unit | null {
    const cost = this.costOf(def)
    if (!free && this.cash < cost) return null
    if (!this.canPlace(def, x, z)) return null
    if (!free) this.cash -= cost
    const u: Unit = {
      id: this.nextId++,
      defId: def.id,
      x, z, rot,
      slots: new Array(def.slots).fill(null),
      growth: new Array(def.slots).fill(0),
      accum: 0,
      lastPayout: 0,
      aura: emptyAura(),
    }
    // A new machine arrives with one common symbol, so it is never dead on
    // arrival and the player has something to build around immediately.
    if (def.slots > 0) u.slots[0] = this.rollSymbol('COMMON')
    this.units.push(u)
    this.refreshAuras()
    return u
  }

  canPlace(def: UnitDef, x: number, z: number, ignoreId = -1): boolean {
    if (Math.hypot(x, z) > 32) return false
    for (const u of this.units) {
      if (u.id === ignoreId) continue
      const other = UNIT_BY_ID.get(u.defId)!
      if (Math.hypot(u.x - x, u.z - z) < def.footprint + other.footprint) return false
    }
    return true
  }

  remove(u: Unit, refund = 0.5) {
    const i = this.units.indexOf(u)
    if (i < 0) return
    const def = UNIT_BY_ID.get(u.defId)!
    this.units.splice(i, 1)
    this.cash += Math.floor(unitCost(def, Math.max(0, this.owned(def.id))) * refund)
    for (const s of u.slots) if (s) this.inventory[s] = (this.inventory[s] ?? 0) + 1
    this.refreshAuras()
  }

  move(u: Unit, x: number, z: number): boolean {
    const def = UNIT_BY_ID.get(u.defId)!
    if (!this.canPlace(def, x, z, u.id)) return false
    u.x = x
    u.z = z
    this.refreshAuras()
    return true
  }

  /**
   * Aura sums are cached per unit and recomputed only when the layout changes.
   * Doing this in the tick would be O(n^2) at 10 Hz for no benefit.
   */
  refreshAuras() {
    const range = this.auraRangeMult
    for (const u of this.units) {
      const sums = emptyAura()
      for (const other of this.units) {
        if (other === u) continue
        const def = UNIT_BY_ID.get(other.defId)!
        const dist = Math.hypot(u.x - other.x, u.z - other.z)
        for (const a of def.auras) {
          const r = a.radius * range
          if (dist > r) continue
          // Smooth falloff: a building just inside the edge should be worth
          // slightly less than one at the centre, or placement stops mattering.
          const f = 1 - dist / r
          sums[a.kind] += f * f * a.strength
        }
      }
      u.aura = sums
    }
  }

  // --- machine maths --------------------------------------------------------

  /** Seconds between spins after TRAFFIC and the RATE upgrade. */
  period(u: Unit): number {
    const def = UNIT_BY_ID.get(u.defId)!
    const traffic = 1 + Math.min(2.5, u.aura.TRAFFIC * 0.3)
    return Math.max(0.3, def.period / (traffic * this.rateMult))
  }

  payoutMult(u: Unit): number {
    const def = UNIT_BY_ID.get(u.defId)!
    const glamour = Math.min(3.0, u.aura.GLAMOUR * 0.45)
    const noise = Math.min(0.75, u.aura.NOISE * 0.3)
    const powered = !def.needsPower || u.aura.POWER > 0.15
    const power = powered ? 1 : 0.35
    return def.scale * (1 + glamour - noise) * power * this.yieldMult * heatBand(this.heat).mult
  }

  luckBonus(u: Unit): number {
    return Math.min(0.35, u.aura.LUCK * 0.1)
  }

  /** Expected payout ignoring CHANCE variance, for the income readout. */
  expectedPayout(u: Unit): number {
    const def = UNIT_BY_ID.get(u.defId)!
    if (def.slots === 0) return 0
    const probe = new Rng(1)
    let sum = 0
    const n = 6
    for (let i = 0; i < n; i++) {
      sum += resolveSpin(u.slots, u.growth, def.gridWidth, probe, this.luckBonus(u)).total
    }
    return (sum / n) * this.payoutMult(u)
  }

  // --- symbols --------------------------------------------------------------

  rollSymbol(forceRarity?: Rarity, luck = 0): string {
    const pool = forceRarity ? SYMBOLS.filter((s) => s.rarity === forceRarity) : SYMBOLS
    let total = 0
    const weights = pool.map((s) => {
      // Luck tilts the pool toward rarity rather than adding a separate roll.
      const boost = s.rarity === 'COMMON' ? 1 : 1 + luck * 2.5
      const w = RARITY_WEIGHT[s.rarity] * boost
      total += w
      return w
    })
    let r = this.rng.next() * total
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]
      if (r <= 0) return pool[i].id
    }
    return pool[pool.length - 1].id
  }

  drawCost(): number {
    return Math.ceil(60 * Math.pow(1.19, this.draws))
  }

  /** The symbol draw is itself a gamble: pay cash, get a weighted roll. */
  draw(free = false): string | null {
    if (!free) {
      const cost = this.drawCost()
      if (this.cash < cost) return null
      this.cash -= cost
    }
    const luck = this.units.reduce((m, u) => Math.max(m, this.luckBonus(u)), 0)
    const id = this.rollSymbol(undefined, luck)
    this.inventory[id] = (this.inventory[id] ?? 0) + 1
    this.draws++
    const def = SYMBOL_BY_ID.get(id)!
    this.pushLog(`DREW ${def.name}`, def.rarity === 'COMMON' ? 0 : 4)
    return id
  }

  install(u: Unit, slot: number, symbolId: string): boolean {
    if (slot < 0 || slot >= u.slots.length) return false
    if ((this.inventory[symbolId] ?? 0) <= 0) return false
    const prev = u.slots[slot]
    this.inventory[symbolId]--
    if (this.inventory[symbolId] <= 0) delete this.inventory[symbolId]
    if (prev) this.inventory[prev] = (this.inventory[prev] ?? 0) + 1
    u.slots[slot] = symbolId
    u.growth[slot] = 0
    return true
  }

  uninstall(u: Unit, slot: number): boolean {
    const prev = u.slots[slot]
    if (!prev) return false
    this.inventory[prev] = (this.inventory[prev] ?? 0) + 1
    u.slots[slot] = null
    u.growth[slot] = 0
    return true
  }

  // --- progression ----------------------------------------------------------

  cashout(): number {
    const gained = this.cashoutChips()
    if (gained <= 0) return 0
    this.chips += gained
    this.cashouts++
    this.bandwidth++
    // A Cashout that leaves the player with nothing to build with is a dead
    // end, not a prestige. The stake grows with Chips so later runs restart
    // faster, which is the whole point of the reset.
    this.cash = SEED_STAKE * (1 + this.chips * 0.35)
    this.lifetimeCash = 0
    this.heat = 0
    this.meltdownUntil = 0
    this.shutdownUntil = 0
    for (const u of this.units) for (const s of u.slots) {
      if (s) this.inventory[s] = (this.inventory[s] ?? 0) + 1
    }
    this.units = []
    this.pushLog(`CASHOUT ▸ +${gained} CHIPS`, 4)
    return gained
  }

  buyUpgrade(id: UpgradeId): boolean {
    const up = UPGRADES.find((u) => u.id === id)!
    const level = this.upgrades[id]
    if (level >= up.max) return false
    const cost = upgradeCost(level)
    if (this.chips < cost) return false
    this.chips -= cost
    this.upgrades[id]++
    if (id === 'AURA') this.refreshAuras()
    return true
  }

  buyTier(): boolean {
    const next = this.tier + 1
    if (next >= TIER_COST.length) return false
    const cost = TIER_COST[next]
    if (this.bandwidth < cost) return false
    this.bandwidth -= cost
    this.tier = next
    this.pushLog(`UPLINK ▸ TIER ${next}`, 5)
    return true
  }

  private milestonesPaid = 0

  private checkMilestones() {
    while (
      this.milestonesPaid < BANDWIDTH_MILESTONES.length &&
      this.totalCash >= BANDWIDTH_MILESTONES[this.milestonesPaid]
    ) {
      this.milestonesPaid++
      this.bandwidth++
      this.pushLog('BANDWIDTH ▸ +1', 5)
    }
  }

  // --- simulation -----------------------------------------------------------

  pushLog(text: string, color = 1) {
    this.log.push({ tick: this.tick, text, color })
    if (this.log.length > 60) this.log.shift()
  }

  /**
   * One fixed simulation step. The same function runs live, during offline
   * catch-up and in the balance harness, which is what makes offline progress
   * and replays trustworthy (features.md section 13).
   */
  step() {
    const dt = TICK_MS / 1000
    this.tick++

    const shutdown = this.tick < this.shutdownUntil
    let pressure = 0
    let securityTotal = 0
    let machines = 0

    if (!shutdown) {
      for (const u of this.units) {
        const def = UNIT_BY_ID.get(u.defId)!
        securityTotal += u.aura.SECURITY
        if (def.slots === 0) continue
        machines++
        pressure += u.aura.GLAMOUR + u.aura.TRAFFIC + u.aura.LUCK * 0.5 + u.aura.NOISE * 1.6
        u.accum += dt
        const period = this.period(u)
        let guard = 0
        while (u.accum >= period && guard++ < 8) {
          u.accum -= period
          const res = resolveSpin(u.slots, u.growth, def.gridWidth, this.rng, this.luckBonus(u))
          applyGrowth(u.slots, u.growth)
          const payout = res.total * this.payoutMult(u)
          u.lastPayout = payout
          this.cash += payout
          this.lifetimeCash += payout
          this.totalCash += payout
        }
      }
    }

    // Heat is an equilibrium, not an accumulator.
    //
    // Driving it from raw spin count made it saturate at 100% the moment a
    // district got large, which removed the decision entirely - verified with
    // the balance harness. Instead it seeks a target set by how *densely* the
    // district is packed with auras, normalised by machine count, so the
    // question stays "how tightly do I build and how much Security do I give
    // up payout for", which is a placement decision as intended.
    const density = machines > 0 ? pressure / machines : 0
    const security = machines > 0 ? securityTotal / machines : 0
    // Capped below the MELTDOWN threshold on purpose: passive play tops out at
    // CRITICAL. Without the cap a large district settles at 100% and melts down
    // on a timer, which turns the top band into a tax rather than a decision.
    // Reaching MELTDOWN needs a deliberate push (see issue #15).
    const PASSIVE_CEILING = 0.92
    const target = shutdown
      ? 0
      : Math.max(0, Math.min(PASSIVE_CEILING, 0.06 + density * 0.3 - security * 0.45))
    this.heat += (target - this.heat) * Math.min(1, 0.05 * dt)
    this.heat = Math.max(0, Math.min(1, this.heat))

    if (this.heat >= 0.96 && this.meltdownUntil === 0) {
      this.meltdownUntil = this.tick + Math.round(60_000 / TICK_MS)
      this.pushLog('MELTDOWN ▸ 60s', 3)
    }
    if (this.meltdownUntil > 0 && this.tick >= this.meltdownUntil) {
      this.meltdownUntil = 0
      this.shutdownUntil = this.tick + Math.round(45_000 / TICK_MS)
      const lost = this.cash * 0.35
      this.cash -= lost
      this.heat = 0.2
      this.pushLog('SEIZED ▸ DISTRICT DARK 45s', 3)
    }

    this.checkMilestones()
  }

  // --- persistence ----------------------------------------------------------

  serialize() {
    return {
      tick: this.tick,
      cash: this.cash,
      lifetimeCash: this.lifetimeCash,
      totalCash: this.totalCash,
      chips: this.chips,
      bandwidth: this.bandwidth,
      cashouts: this.cashouts,
      tier: this.tier,
      phosphor: this.phosphor,
      heat: this.heat,
      seed: this.seed,
      rngState: this.rng.state,
      inventory: this.inventory,
      upgrades: this.upgrades,
      bankedPulls: this.bankedPulls,
      draws: this.draws,
      milestonesPaid: this.milestonesPaid,
      units: this.units.map((u) => ({
        defId: u.defId, x: u.x, z: u.z, rot: u.rot,
        slots: u.slots, growth: u.growth,
      })),
    }
  }

  load(d: ReturnType<Game['serialize']>) {
    this.tick = d.tick ?? 0
    this.cash = d.cash ?? 0
    this.lifetimeCash = d.lifetimeCash ?? 0
    this.totalCash = d.totalCash ?? 0
    this.chips = d.chips ?? 0
    this.bandwidth = d.bandwidth ?? 0
    this.cashouts = d.cashouts ?? 0
    this.tier = d.tier ?? 0
    this.phosphor = d.phosphor ?? 0
    this.heat = d.heat ?? 0
    this.seed = d.seed ?? this.seed
    this.rng = new Rng(this.seed)
    this.rng.state = d.rngState || this.seed
    this.inventory = d.inventory ?? {}
    this.upgrades = { ...this.upgrades, ...(d.upgrades ?? {}) }
    this.bankedPulls = d.bankedPulls ?? 0
    this.draws = d.draws ?? 0
    this.milestonesPaid = d.milestonesPaid ?? 0
    this.units = []
    this.nextId = 1
    for (const su of d.units ?? []) {
      const def = UNIT_BY_ID.get(su.defId)
      if (!def) continue
      this.units.push({
        id: this.nextId++,
        defId: su.defId, x: su.x, z: su.z, rot: su.rot,
        slots: normalizeSlots(su.slots, def.slots),
        growth: normalizeGrowth(su.growth, def.slots),
        accum: 0,
        lastPayout: 0,
        aura: emptyAura(),
      })
    }
    this.refreshAuras()
  }
}

function normalizeSlots(slots: (string | null)[] | undefined, n: number): (string | null)[] {
  const out = new Array<string | null>(n).fill(null)
  for (let i = 0; i < n; i++) {
    const v = slots?.[i]
    out[i] = v && SYMBOL_BY_ID.has(v) ? v : null
  }
  return out
}

function normalizeGrowth(growth: number[] | undefined, n: number): number[] {
  const out = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) out[i] = growth?.[i] ?? 0
  return out
}

export function emptyAura(): AuraSums {
  return { GLAMOUR: 0, TRAFFIC: 0, LUCK: 0, SECURITY: 0, NOISE: 0, POWER: 0 }
}
