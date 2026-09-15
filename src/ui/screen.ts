import { CellBuffer } from './cellBuffer'
import { Game, HEAT_BANDS, TIER_COST, UPGRADES, heatBand, upgradeCost, type Unit } from '../game/state'
import { UNIT_BY_ID, unitCost, type UnitDef } from '../game/units'
import { RARITY_COLOR, SYMBOL_BY_ID } from '../game/symbols'
import { TIERS, PHOSPHORS, type Tier } from '../render/tiers'
import { TICK_MS } from '../sim/loop'
import { Boot, crawl } from './boot'

export interface Region { x: number; y: number; w: number; h: number; id: string }

export type Channel = 'MAP' | 'MACH' | 'OPS' | 'SYS'

export const C_DIM = 0, C_MAIN = 1, C_BRIGHT = 2, C_ALERT = 3, C_OK = 4, C_INFO = 5, C_RARE = 6

export interface ScreenState {
  channel: Channel
  cols: number
  rows: number
  fps: number
  selectedDef: UnitDef | null
  selected: Unit | null
  /** Machine open in the MACH detail view. */
  detail: Unit | null
  /** Slot awaiting a symbol choice, or -1. */
  pendingSlot: number
  buildPage: number
  status: string
  showAuras: boolean
  delta: number | null
  /** Night Shift Report, shown until dismissed. */
  report: string[] | null
  /** Camera azimuth, for the compass. */
  azimuth: number
  /** Boot sequence, or null once it has finished. */
  boot: Boot | null
  /** Wall-clock milliseconds, for crawl timing. */
  now: number
}

const TOP = 3
const FOOTER = 4

/**
 * The whole interface, drawn as characters into the same cell grid as the 3D
 * world. Nothing here is HTML.
 *
 * Every layout decision assumes 40 columns is possible, because tier 0 is
 * where a new player starts.
 */
export class Screen {
  regions: Region[] = []
  /**
   * Controls that did not fit the current width. Empty is the invariant; the
   * verification harness asserts it at 40 columns, because silently dropping a
   * control at tier 0 means it does not exist to a new player (issue #6).
   */
  overflow: string[] = []
  /** Row after the last line a channel drew, so the log can fill the rest. */
  private contentBottom = 0

  static readonly TOP = TOP
  static readonly FOOTER = FOOTER

  draw(buf: CellBuffer, g: Game, s: ScreenState) {
    const { cols, rows } = s
    buf.clear()
    this.regions = []

    const tier = TIERS[g.tier]

    if (s.boot && !s.boot.done) {
      this.bootScreen(buf, s, tier)
      return
    }

    this.shell(buf, g, s, tier)

    const bodyTop = TOP
    const bodyBottom = rows - FOOTER   // exclusive

    if (s.report) {
      this.reportPanel(buf, s, bodyTop, bodyBottom)
    } else {
      this.contentBottom = bodyTop
      switch (s.channel) {
        case 'MAP': this.mapChannel(buf, g, s, bodyTop, bodyBottom); break
        case 'MACH': this.machChannel(buf, g, s, bodyTop, bodyBottom); break
        case 'OPS': this.opsChannel(buf, g, s, bodyTop, bodyBottom); break
        case 'SYS': this.sysChannel(buf, g, s, bodyTop, bodyBottom); break
      }
      if (s.channel !== 'MAP') this.eventLog(buf, g, s, this.contentBottom, bodyBottom)
    }
    this.footer(buf, s, rows, cols)

    this.overflow = this.regions
      .filter((r) => r.x < 1 || r.x + r.w > cols - 1)
      .map((r) => r.id)
  }

  /** Full-screen boot takeover. Tap anywhere to skip. */
  private bootScreen(buf: CellBuffer, s: ScreenState, tier: Tier) {
    const { cols, rows } = s
    buf.box(0, 0, cols, rows, C_MAIN)
    const lines = s.boot!.visible(s.now, tier)
    let y = 2
    for (const line of lines) {
      buf.text(2, y, line.slice(0, cols - 4), y === 0 ? C_BRIGHT : C_MAIN)
      y++
    }
    buf.text(2, rows - 2, '[SKIP]', C_DIM)
    this.regions.push({ x: 1, y: 1, w: cols - 2, h: rows - 2, id: 'bootskip' })
  }

  // --- shell ---------------------------------------------------------------

  private shell(buf: CellBuffer, g: Game, s: ScreenState, tier: Tier) {
    const { cols } = s
    buf.text(0, 0, '┌─ BAUDA/OS ', C_MAIN)
    for (let x = 12; x < cols - 1; x++) buf.set(x, 0, '─', C_MAIN)
    buf.set(cols - 1, 0, '┐', C_MAIN)
    buf.textRight(cols - 3, 0, ` ${tier.baud} baud `, C_DIM)

    buf.set(0, 1, '│', C_MAIN)
    buf.set(cols - 1, 1, '│', C_MAIN)
    buf.text(2, 1, 'NEON FLATS', C_BRIGHT)
    buf.textRight(cols - 2, 1, `${fmt(g.cash)} ¢`, C_OK)

    buf.set(0, 2, '├', C_MAIN)
    buf.set(cols - 1, 2, '┤', C_MAIN)
    for (let x = 1; x < cols - 1; x++) buf.set(x, 2, '─', C_MAIN)
    const band = heatBand(g.heat)
    const heatTxt = `[${band.name} ${Math.round(g.heat * 100)}% ×${band.mult}]`
    buf.textRight(cols - 2, 2, heatTxt, band.color)
  }

  private footer(buf: CellBuffer, s: ScreenState, rows: number, cols: number) {
    let y = rows - FOOTER
    buf.set(0, y, '├', C_MAIN)
    buf.set(cols - 1, y, '┤', C_MAIN)
    for (let x = 1; x < cols - 1; x++) buf.set(x, y, '─', C_MAIN)

    y++
    this.rail(buf, y, cols)
    let x = 2
    for (const ch of ['MAP', 'MACH', 'OPS', 'SYS'] as Channel[]) {
      const t = `[${ch}]`
      if (x + t.length > cols - 2) break
      const on = ch === s.channel
      buf.text(x, y, t, on ? C_BRIGHT : C_DIM, on)
      this.regions.push({ x, y, w: t.length, h: 1, id: `chan:${ch}` })
      x += t.length + 1
    }

    y++
    this.rail(buf, y, cols)
    buf.text(2, y, s.status.slice(0, Math.max(0, cols - 12)), C_DIM)
    buf.textRight(cols - 2, y, `${s.fps.toFixed(0)}f`, s.fps < 45 ? C_ALERT : C_DIM)

    y++
    buf.set(0, y, '└', C_MAIN)
    buf.set(cols - 1, y, '┘', C_MAIN)
    for (let i = 1; i < cols - 1; i++) buf.set(i, y, '─', C_MAIN)
  }

  private rail(buf: CellBuffer, y: number, cols: number) {
    buf.fill(1, y, cols - 2, 1, ' ', C_DIM)
    buf.set(0, y, '│', C_MAIN)
    buf.set(cols - 1, y, '│', C_MAIN)
  }

  private rails(buf: CellBuffer, from: number, to: number, cols: number) {
    for (let y = from; y < to; y++) {
      buf.set(0, y, '│', C_MAIN)
      buf.set(cols - 1, y, '│', C_MAIN)
    }
  }

  // --- MAP -----------------------------------------------------------------

  private mapChannel(buf: CellBuffer, g: Game, s: ScreenState, top: number, bottom: number) {
    const { cols } = s
    this.rails(buf, top, bottom, cols)
    this.compass(buf, s, top)

    if (g.units.length === 0) this.firstRunHint(buf, s, top, bottom)

    // Three control rows sit over the bottom of the world view.
    let y = bottom - 3
    this.rail(buf, y, cols)
    buf.text(2, y, 'YIELD ▸ ', C_DIM)
    buf.text(10, y, `${fmt(g.income())}/s`, C_BRIGHT)
    if (s.delta !== null) {
      buf.textRight(cols - 2, y, `${s.delta >= 0 ? '+' : ''}${fmt(s.delta)}/s`, s.delta >= 0 ? C_OK : C_ALERT)
    } else {
      buf.textRight(cols - 2, y, `${g.units.length}U`, C_DIM)
    }

    // Build palette, paginated so nothing is silently truncated at 40 columns.
    y++
    this.rail(buf, y, cols)
    const unlocked = g.unlockedUnits
    const avail = cols - 12
    const perPage = Math.max(1, Math.floor(avail / 6))
    const pages = Math.max(1, Math.ceil(unlocked.length / perPage))
    const page = ((s.buildPage % pages) + pages) % pages
    let x = 2
    buf.text(x, y, '◂', C_MAIN)
    this.regions.push({ x, y, w: 1, h: 1, id: 'page:-' })
    x += 2
    for (let i = page * perPage; i < Math.min(unlocked.length, (page + 1) * perPage); i++) {
      const def = unlocked[i]
      const t = `[${def.label}]`
      const cost = g.costOf(def)
      const afford = g.cash >= cost
      const sel = s.selectedDef?.id === def.id
      buf.text(x, y, t, sel ? C_BRIGHT : afford ? C_MAIN : C_DIM, sel)
      this.regions.push({ x, y, w: t.length, h: 1, id: `build:${def.id}` })
      x += t.length
    }
    buf.text(cols - 3, y, '▸', C_MAIN)
    this.regions.push({ x: cols - 3, y, w: 1, h: 1, id: 'page:+' })

    // Selected unit's cost, or the selected building's controls.
    y++
    this.rail(buf, y, cols)
    if (s.selectedDef) {
      const cost = g.costOf(s.selectedDef)
      buf.text(2, y, `${s.selectedDef.name} ${fmt(cost)}¢`, g.cash >= cost ? C_OK : C_ALERT)
      buf.textRight(cols - 2, y, '[X]', C_MAIN)
      this.regions.push({ x: cols - 4, y, w: 3, h: 1, id: 'cancel' })
    } else {
      x = 2
      const acts: [string, string][] = [
        ['◂', 'nudge:-x'], ['▸', 'nudge:+x'], ['▴', 'nudge:-z'], ['▾', 'nudge:+z'],
        ['R', 'rot'], ['X', 'del'], [s.showAuras ? 'A*' : 'A', 'aura'],
      ]
      for (const [label, id] of acts) {
        const t = `[${label}]`
        if (x + t.length > cols - 2) break
        const live = id === 'aura' || !!s.selected
        buf.text(x, y, t, live ? C_MAIN : C_DIM)
        this.regions.push({ x, y, w: t.length, h: 1, id })
        x += t.length
      }
      if (s.selected) {
        const def = UNIT_BY_ID.get(s.selected.defId)!
        buf.textRight(cols - 2, y, def.label, C_BRIGHT)
      }
    }
  }

  /**
   * Orientation reference, always visible. Without it the camera can be rotated
   * into a view the player cannot place themselves in (issue #14).
   */
  private compass(buf: CellBuffer, s: ScreenState, top: number) {
    const cx = s.cols - 4
    const cy = top + 2
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) buf.set(cx + dx, cy + dy, '·', C_DIM)
    }
    buf.set(cx, cy, '◆', C_DIM)

    // World north is -Z. Project it into screen axes to find where to put the N.
    const a = s.azimuth
    const dx = -Math.cos(a)          // component along screen right
    const up = Math.sin(a)           // component along screen up
    const ang = Math.atan2(dx, up)   // 0 = up, +pi/2 = right
    const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8
    const ring: [number, number][] = [
      [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ]
    const [ox, oy] = ring[idx]
    buf.set(cx + ox, cy + oy, 'N', C_INFO)
  }

  /** Shown until the first unit is placed, then never again. */
  private firstRunHint(buf: CellBuffer, s: ScreenState, top: number, bottom: number) {
    const { cols } = s
    const w = Math.min(cols - 6, 34)
    const x = Math.floor((cols - w) / 2)
    const y = Math.floor((top + bottom) / 2) - 3
    buf.fill(x, y, w, 6, ' ', C_DIM)
    buf.box(x, y, w, 6, C_MAIN, 'START')
    buf.text(x + 2, y + 2, '1. TAP [SLT1] BELOW', C_BRIGHT)
    buf.text(x + 2, y + 3, '2. TAP THE GROUND', C_BRIGHT)
    buf.text(x + 2, y + 4, 'DRAG TO PAN, PINCH TO ZOOM', C_DIM)
  }

  // --- MACH ----------------------------------------------------------------

  private machChannel(buf: CellBuffer, g: Game, s: ScreenState, top: number, bottom: number) {
    const { cols } = s
    this.rails(buf, top, bottom, cols)
    for (let y = top; y < bottom; y++) buf.fill(1, y, cols - 2, 1, ' ', C_DIM)

    if (s.detail) this.machDetail(buf, g, s, top, bottom)
    else this.machList(buf, g, s, top, bottom)
  }

  private machList(buf: CellBuffer, g: Game, s: ScreenState, top: number, bottom: number) {
    const { cols } = s
    let y = top
    buf.text(2, y, 'MACHINES', C_BRIGHT)
    buf.textRight(cols - 2, y, `${g.units.filter(machineLike).length}`, C_DIM)
    y += 2
    const machines = g.units.filter(machineLike)
    if (machines.length === 0) {
      buf.text(2, y, 'NO MACHINES PLACED.', C_DIM)
      buf.text(2, y + 1, 'BUILD ONE IN [MAP].', C_DIM)
      this.contentBottom = y + 2
      return
    }
    for (const u of machines) {
      if (y >= bottom - 1) break
      this.contentBottom = y + 1
      const def = UNIT_BY_ID.get(u.defId)!
      const filled = u.slots.filter(Boolean).length
      buf.text(2, y, def.label, C_BRIGHT)
      buf.text(7, y, `${filled}/${def.slots}`, filled < def.slots ? C_ALERT : C_DIM)
      buf.textRight(cols - 2, y, `${fmt(g.expectedPayout(u) / g.period(u))}/s`, C_OK)
      this.regions.push({ x: 1, y, w: cols - 2, h: 1, id: `mach:${u.id}` })
      y++
    }
  }

  private machDetail(buf: CellBuffer, g: Game, s: ScreenState, top: number, bottom: number) {
    const { cols } = s
    const u = s.detail!
    const def = UNIT_BY_ID.get(u.defId)!
    let y = top
    buf.text(2, y, def.name, C_BRIGHT)
    buf.textRight(cols - 2, y, '[BACK]', C_MAIN)
    this.regions.push({ x: cols - 8, y, w: 6, h: 1, id: 'back' })
    y++
    buf.text(2, y, `×${g.payoutMult(u).toFixed(2)}  ${g.period(u).toFixed(1)}s`, C_DIM)
    buf.textRight(cols - 2, y, `${fmt(g.expectedPayout(u) / g.period(u))}/s`, C_OK)
    y += 2

    // Slot grid. Tapping a slot arms it; then tap an inventory symbol.
    const w = def.gridWidth
    const rowsN = Math.ceil(def.slots / w)
    const cellW = 4
    const gx = 2
    for (let r = 0; r < rowsN; r++) {
      const gy = y + r
      for (let c = 0; c < w; c++) {
        const i = r * w + c
        if (i >= def.slots) break
        const x = gx + c * cellW
        const id = u.slots[i]
        const sym = id ? SYMBOL_BY_ID.get(id) : null
        const armed = s.pendingSlot === i
        buf.text(x, gy, '[', armed ? C_BRIGHT : C_DIM)
        buf.set(x + 1, gy, sym ? sym.glyph : '.', sym ? RARITY_COLOR[sym.rarity] : C_DIM, armed)
        buf.text(x + 2, gy, ']', armed ? C_BRIGHT : C_DIM)
        this.regions.push({ x, y: gy, w: 3, h: 1, id: `slot:${i}` })
      }
    }
    y += rowsN + 1

    if (s.pendingSlot >= 0) {
      const cur = u.slots[s.pendingSlot]
      buf.text(2, y, cur ? `SLOT ${s.pendingSlot + 1}: [CLEAR]` : `SLOT ${s.pendingSlot + 1}: PICK`, C_INFO)
      if (cur) this.regions.push({ x: 11, y, w: 7, h: 1, id: 'clearslot' })
    } else {
      const sym = u.slots.find(Boolean)
      const d = sym ? SYMBOL_BY_ID.get(sym) : null
      buf.text(2, y, d ? d.note.slice(0, cols - 4) : 'TAP A SLOT.', C_DIM)
    }
    y += 2

    const cost = g.drawCost()
    const free = g.bankedPulls > 0
    buf.text(2, y, free ? '[DRAW FREE]' : `[DRAW ${fmt(cost)}¢]`, free || g.cash >= cost ? C_OK : C_DIM)
    this.regions.push({ x: 2, y, w: free ? 11 : 8 + fmt(cost).length, h: 1, id: 'draw' })
    const invCount = Object.values(g.inventory).reduce((a, b) => a + b, 0)
    buf.textRight(cols - 2, y, `BAG ${invCount}`, C_DIM)
    y += 2

    // Inventory
    const entries = Object.entries(g.inventory).filter(([, n]) => n > 0)
    if (entries.length === 0) {
      buf.text(2, y, 'BAG EMPTY - DRAW A SYMBOL.', C_DIM)
      this.contentBottom = y + 1
      return
    }
    let x = 2
    for (const [id, n] of entries) {
      const d = SYMBOL_BY_ID.get(id)!
      const t = `${d.glyph}${n > 1 ? n : ''}`
      if (x + t.length + 1 > cols - 2) { x = 2; y++ }
      if (y >= bottom - 1) break
      buf.text(x, y, t, RARITY_COLOR[d.rarity])
      this.regions.push({ x, y, w: t.length, h: 1, id: `inv:${id}` })
      x += t.length + 1
    }
    this.contentBottom = y + 1
  }

  // --- OPS -----------------------------------------------------------------

  private opsChannel(buf: CellBuffer, g: Game, s: ScreenState, top: number, bottom: number) {
    const { cols } = s
    this.rails(buf, top, bottom, cols)
    for (let y = top; y < bottom; y++) buf.fill(1, y, cols - 2, 1, ' ', C_DIM)

    let y = top
    const band = heatBand(g.heat)
    buf.text(2, y, 'HEAT', C_BRIGHT)
    buf.meter(7, y, Math.min(16, cols - 22), g.heat, band.color)
    buf.textRight(cols - 2, y, `${band.name} ×${band.mult}`, band.color)
    y++
    const next = HEAT_BANDS.find((b) => b.from > g.heat)
    buf.text(2, y, next ? `NEXT BAND ${Math.round(next.from * 100)}% ▸ ×${next.mult}` : 'MELTDOWN IMMINENT', next ? C_DIM : C_ALERT)
    y += 2

    const gain = g.cashoutChips()
    buf.text(2, y, 'CASHOUT', C_BRIGHT)
    buf.textRight(cols - 2, y, `+${gain} ◆`, gain > 0 ? C_OK : C_DIM)
    y++
    buf.text(2, y, `RUN ${fmt(g.lifetimeCash)}¢`, C_DIM)
    if (gain > 0) {
      buf.textRight(cols - 2, y, '[CASHOUT]', C_OK)
      this.regions.push({ x: cols - 11, y, w: 9, h: 1, id: 'cashout' })
    } else {
      buf.textRight(cols - 2, y, `NEED ${fmt(Game.CASHOUT_FLOOR)}¢`, C_DIM)
    }
    y += 2

    buf.text(2, y, 'CHIPS', C_BRIGHT)
    buf.textRight(cols - 2, y, `${g.chips} ◆`, C_INFO)
    y++
    for (const up of UPGRADES) {
      if (y >= bottom - 1) break
      const lvl = g.upgrades[up.id]
      const cost = upgradeCost(lvl)
      const can = g.chips >= cost && lvl < up.max
      buf.text(2, y, up.name, can ? C_MAIN : C_DIM)
      buf.text(9, y, `L${lvl}`, C_DIM)
      buf.text(13, y, up.note.slice(0, cols - 24), C_DIM)
      buf.textRight(cols - 2, y, lvl >= up.max ? 'MAX' : `[${cost}◆]`, can ? C_OK : C_DIM)
      this.regions.push({ x: 1, y, w: cols - 2, h: 1, id: `up:${up.id}` })
      y++
    }
    this.contentBottom = y
  }

  // --- SYS -----------------------------------------------------------------

  private sysChannel(buf: CellBuffer, g: Game, s: ScreenState, top: number, bottom: number) {
    const { cols } = s
    this.rails(buf, top, bottom, cols)
    for (let y = top; y < bottom; y++) buf.fill(1, y, cols - 2, 1, ' ', C_DIM)

    let y = top
    const tier = TIERS[g.tier]
    buf.text(2, y, 'UPLINK', C_BRIGHT)
    buf.textRight(cols - 2, y, `${g.bandwidth} ~`, C_INFO)
    y++
    buf.text(2, y, `T${tier.id} ${tier.name} ${s.cols}×${s.rows}`, C_MAIN)
    y++
    const nextTier = TIERS[g.tier + 1]
    if (nextTier) {
      const cost = TIER_COST[nextTier.id]
      const can = g.bandwidth >= cost
      buf.text(2, y, `T${nextTier.id} ${nextTier.name} ${nextTier.cols} COLS`, can ? C_MAIN : C_DIM)
      buf.textRight(cols - 2, y, `[${cost}~]`, can ? C_OK : C_DIM)
      this.regions.push({ x: 1, y, w: cols - 2, h: 1, id: 'buytier' })
    } else {
      buf.text(2, y, 'MAX UPLINK', C_DIM)
    }
    y += 2

    buf.text(2, y, 'PHOSPHOR', C_BRIGHT)
    buf.textRight(cols - 2, y, `[${PHOSPHORS[g.phosphor].name}]`, C_MAIN)
    this.regions.push({ x: cols - 12, y, w: 10, h: 1, id: 'phos' })
    y += 2

    buf.text(2, y, 'SAVE', C_BRIGHT)
    y++
    buf.text(2, y, '[EXPORT]', C_MAIN)
    this.regions.push({ x: 2, y, w: 8, h: 1, id: 'export' })
    buf.text(12, y, '[IMPORT]', C_MAIN)
    this.regions.push({ x: 12, y, w: 8, h: 1, id: 'import' })
    y += 2

    buf.text(2, y, 'STATS', C_BRIGHT)
    y++
    const stats: [string, string][] = [
      ['TOTAL', `${fmt(g.totalCash)}¢`],
      ['CASHOUTS', `${g.cashouts}`],
      ['DRAWS', `${g.draws}`],
      ['UNITS', `${g.units.length}`],
      ['TICK', `${g.tick}`],
    ]
    for (const [k, v] of stats) {
      if (y >= bottom - 1) break
      buf.text(2, y, k, C_DIM)
      buf.textRight(cols - 2, y, v, C_DIM)
      y++
    }
    this.contentBottom = y
  }

  // --- night shift report --------------------------------------------------

  private reportPanel(buf: CellBuffer, s: ScreenState, top: number, bottom: number) {
    const { cols } = s
    this.rails(buf, top, bottom, cols)
    for (let y = top; y < bottom; y++) buf.fill(1, y, cols - 2, 1, ' ', C_DIM)
    let y = top
    for (const line of s.report!) {
      if (y >= bottom - 2) break
      const color = line.startsWith('TOTAL') ? C_OK : line.startsWith('>') ? C_INFO : C_DIM
      buf.text(2, y, line.slice(0, cols - 4), color)
      y++
    }
    const by = bottom - 2
    buf.text(2, by, '[RESUME]', C_BRIGHT)
    this.regions.push({ x: 2, y: by, w: 8, h: 1, id: 'dismiss' })
  }

  /**
   * Fills whatever a channel did not use with the running event log. A phone
   * screen is tall; a panel floating in a void looks unfinished, and the log is
   * both real information and exactly what a terminal should be showing.
   */
  private eventLog(buf: CellBuffer, g: Game, s: ScreenState, from: number, to: number) {
    const { cols } = s
    if (to - from < 4) return
    let y = from + 1
    buf.set(0, y, '├', C_MAIN)
    buf.set(cols - 1, y, '┤', C_MAIN)
    for (let x = 1; x < cols - 1; x++) buf.set(x, y, '─', C_MAIN)
    buf.text(2, y, ' LOG ', C_DIM)
    y++
    const room = to - y
    const lines = g.log.slice(-room)
    const cps = TIERS[g.tier].cps
    for (let i = 0; i < lines.length; i++) {
      if (y >= to) break
      const line = lines[i]
      // Only the newest line crawls; older ones are already on the wire.
      const text = i === lines.length - 1
        ? crawl(line.text, ((g.tick - line.tick) * TICK_MS) / 1000, cps)
        : line.text
      buf.text(2, y, text.slice(0, cols - 4), line.color)
      y++
    }
  }

  // --- hit testing ---------------------------------------------------------

  hit(cx: number, cy: number): string | null {
    for (const r of this.regions) {
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) return r.id
    }
    return null
  }

  /** True when the world is visible at this cell (MAP channel, outside chrome). */
  isWorldCell(s: ScreenState, cy: number): boolean {
    if (s.channel !== 'MAP' || s.report) return false
    return cy >= TOP && cy < s.rows - FOOTER - 3
  }
}

function machineLike(u: Unit): boolean {
  return (UNIT_BY_ID.get(u.defId)?.slots ?? 0) > 0
}

export function fmt(n: number): string {
  if (!isFinite(n)) return 'INF'
  const a = Math.abs(n)
  if (a < 1000) return n.toFixed(a < 10 ? 1 : 0)
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp']
  let i = -1
  let v = n
  while (Math.abs(v) >= 1000 && i < units.length - 1) { v /= 1000; i++ }
  return `${v.toFixed(2)}${units[i]}`
}

export { unitCost }
