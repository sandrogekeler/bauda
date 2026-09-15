import { CellBuffer } from './cellBuffer'
import { BUILDINGS } from '../world/buildings'
import type { Tier } from '../render/tiers'

export interface Region { x: number; y: number; w: number; h: number; id: string }

export interface HudState {
  tier: Tier
  phosphorName: string
  cols: number
  rows: number
  fps: number
  cash: number
  income: number
  heat: number
  selectedDef: string | null
  placedCount: number
  delta: number | null
  status: string
  showAuras: boolean
  hasSelection: boolean
}

const C_DIM = 0, C_MAIN = 1, C_BRIGHT = 2, C_ALERT = 3, C_OK = 4, C_INFO = 5

/**
 * Terminal chrome. Drawn as characters into the same cell grid as the world,
 * then composited by the ASCII pass - no HTML overlay anywhere.
 *
 * Every interactive control sits in the bottom third for one-handed reach
 * (features.md section 12).
 */
export class Hud {
  regions: Region[] = []

  /** Rows of chrome reserved at the bottom. */
  static readonly BOTTOM = 9
  static readonly TOP = 3

  draw(buf: CellBuffer, s: HudState) {
    const { cols, rows } = s
    buf.clear()
    this.regions = []

    // The whole frame starts transparent; chrome is drawn over it.
    // (clear() already zeroes alpha, so the world shows through by default.)

    // ---- top bar -----------------------------------------------------------
    buf.text(0, 0, '┌─ BAUDA/OS ', C_MAIN)
    for (let x = 12; x < cols - 1; x++) buf.set(x, 0, '─', C_MAIN)
    buf.set(cols - 1, 0, '┐', C_MAIN)
    const baud = ` ${s.tier.baud} baud `
    buf.textRight(cols - 3, 0, baud, C_DIM)

    buf.set(0, 1, '│', C_MAIN)
    buf.set(cols - 1, 1, '│', C_MAIN)
    buf.text(2, 1, 'NEON FLATS', C_BRIGHT)
    const bank = `BANK ▸ ${fmt(s.cash)} ¢`
    buf.textRight(cols - 3, 1, bank, C_OK)

    buf.set(0, 2, '├', C_MAIN)
    buf.set(cols - 1, 2, '┤', C_MAIN)
    for (let x = 1; x < cols - 1; x++) buf.set(x, 2, '─', C_MAIN)
    const heatLabel = `[HEAT ${Math.round(s.heat * 100)}%]`
    buf.textRight(cols - 3, 2, heatLabel, s.heat > 0.6 ? C_ALERT : C_DIM)

    // ---- viewport side rails ----------------------------------------------
    const top = Hud.TOP
    const bottom = rows - Hud.BOTTOM
    for (let y = top; y < bottom; y++) {
      buf.set(0, y, '│', C_MAIN)
      buf.set(cols - 1, y, '│', C_MAIN)
    }

    // ---- bottom panel ------------------------------------------------------
    let y = bottom
    buf.set(0, y, '├', C_MAIN)
    buf.set(cols - 1, y, '┤', C_MAIN)
    for (let x = 1; x < cols - 1; x++) buf.set(x, y, '─', C_MAIN)

    y++
    this.rail(buf, y, cols)
    const inc = `${fmt(s.income)} ¢/s`
    buf.text(2, y, 'YIELD ▸ ', C_DIM)
    buf.text(10, y, inc, C_BRIGHT)
    if (s.delta !== null) {
      const d = s.delta
      const txt = `${d >= 0 ? '+' : ''}${fmt(d)}`
      buf.textRight(cols - 3, y, txt, d >= 0 ? C_OK : C_ALERT)
    } else {
      buf.textRight(cols - 3, y, `${s.placedCount} UNITS`, C_DIM)
    }

    // build palette
    y++
    this.rail(buf, y, cols)
    let x = 2
    for (const b of BUILDINGS) {
      const label = `[${b.label}]`
      if (x + label.length > cols - 2) break
      const sel = s.selectedDef === b.id
      buf.text(x, y, label, sel ? C_BRIGHT : C_MAIN, sel)
      this.regions.push({ x, y, w: label.length, h: 1, id: `build:${b.id}` })
      x += label.length + 1
    }

    // nudge pad + actions
    y++
    this.rail(buf, y, cols)
    x = 2
    const acts: [string, string][] = [
      ['◂', 'nudge:-x'], ['▸', 'nudge:+x'], ['▲', 'nudge:-z'], ['▼', 'nudge:+z'],
      ['ROT', 'rot'], ['DEL', 'del'], [s.showAuras ? 'AURA*' : 'AURA', 'aura'],
    ]
    for (const [label, id] of acts) {
      const t = `[${label}]`
      if (x + t.length > cols - 2) break
      const live = id.startsWith('nudge') || id === 'rot' || id === 'del' ? s.hasSelection : true
      buf.text(x, y, t, live ? C_MAIN : C_DIM)
      this.regions.push({ x, y, w: t.length, h: 1, id })
      x += t.length
    }

    // tier + phosphor
    y++
    this.rail(buf, y, cols)
    buf.text(2, y, '[-]', C_MAIN)
    this.regions.push({ x: 2, y, w: 3, h: 1, id: 'tier:-' })
    const tierTxt = ` T${s.tier.id} ${s.tier.name} ${s.cols}x${s.rows} `
    buf.text(5, y, tierTxt, C_INFO)
    buf.text(5 + tierTxt.length, y, '[+]', C_MAIN)
    this.regions.push({ x: 5 + tierTxt.length, y, w: 3, h: 1, id: 'tier:+' })
    const ph = `[${s.phosphorName}]`
    if (cols - 3 - ph.length > 5 + tierTxt.length + 4) {
      buf.textRight(cols - 3, y, ph, C_MAIN)
      this.regions.push({ x: cols - 2 - ph.length, y, w: ph.length, h: 1, id: 'phosphor' })
    }

    // channel bar
    y++
    this.rail(buf, y, cols)
    x = 2
    for (const ch of ['MAP', 'MACH', 'NET', 'OPS', 'SYS']) {
      const t = `[${ch}]`
      if (x + t.length > cols - 2) break
      buf.text(x, y, t, ch === 'MAP' ? C_BRIGHT : C_DIM, ch === 'MAP')
      this.regions.push({ x, y, w: t.length, h: 1, id: `chan:${ch}` })
      x += t.length + 1
    }

    // status line
    y++
    this.rail(buf, y, cols)
    buf.text(2, y, s.status.slice(0, cols - 14), C_DIM)
    buf.textRight(cols - 3, y, `${s.fps.toFixed(0)}fps`, s.fps < 45 ? C_ALERT : C_DIM)

    // bottom border
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

  hit(cx: number, cy: number): string | null {
    for (const r of this.regions) {
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) return r.id
    }
    return null
  }
}

export function fmt(n: number): string {
  if (!isFinite(n)) return 'INF'
  const a = Math.abs(n)
  if (a < 1000) return n.toFixed(a < 10 ? 2 : 0)
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi']
  let i = -1
  let v = n
  while (Math.abs(v) >= 1000 && i < units.length - 1) { v /= 1000; i++ }
  return `${v.toFixed(2)}${units[i]}`
}
