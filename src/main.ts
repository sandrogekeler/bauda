import * as THREE from 'three'
import { AsciiRenderer } from './render/asciiRenderer'
import { PHOSPHORS, TIERS } from './render/tiers'
import { CellBuffer } from './ui/cellBuffer'
import { Screen, fmt, type Channel, type ScreenState } from './ui/screen'
import { World } from './world/world'
import { UNIT_BY_ID } from './game/units'
import { Game, type Unit } from './game/state'
import { Gestures } from './input/gestures'
import { SimLoop, TICK_MS } from './sim/loop'
import { exportSave, importSave, load, save, SAVE_VERSION, type SaveData } from './save/save'
import { registerServiceWorker, requestPersistence } from './pwa'
import { autoplay } from './dev/autoplay'

const canvas = document.getElementById('view') as HTMLCanvasElement

const renderer = new AsciiRenderer(canvas)
const world = new World()
const buf = new CellBuffer()
const screen = new Screen()
const game = new Game()

const ui: ScreenState = {
  channel: 'MAP',
  cols: 40,
  rows: 24,
  fps: 60,
  selectedDef: null,
  selected: null,
  detail: null,
  pendingSlot: -1,
  buildPage: 0,
  status: 'BOOT OK',
  showAuras: true,
  delta: null,
  report: null,
}

let userZoom = 1
let ghostPos: { x: number; z: number } | null = null
let ghostRot = 0

const sim = new SimLoop(() => game.step())

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

const BASE_ZOOM = 12

/**
 * Low tiers zoom in. At 40 columns a whole district is an unreadable smear -
 * verified in Phase 0 - so fewer, larger buildings is the only way tier 0 stays
 * playable. The exponent is below 1, so higher tiers still show more city.
 */
function tierZoom(): number {
  return BASE_ZOOM * Math.pow(TIERS[game.tier].cols / 64, 0.6) * userZoom
}

function applyViewport() {
  world.setViewport(canvas.clientWidth / canvas.clientHeight, renderer.rows, Screen.TOP, Screen.FOOTER)
}

function applyTier() {
  renderer.setTier(TIERS[game.tier])
  renderer.setPhosphor(game.phosphor)
  buf.resize(renderer.cols, renderer.rows)
  ui.cols = renderer.cols
  ui.rows = renderer.rows
  world.zoom = tierZoom()
  applyViewport()
  world.updateCamera()
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio, 2)
  canvas.width = Math.floor(canvas.clientWidth * dpr)
  canvas.height = Math.floor(canvas.clientHeight * dpr)
  applyTier()
}

window.addEventListener('resize', resize)

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

function toCell(px: number, py: number) {
  return {
    cx: Math.floor((px / canvas.clientWidth) * renderer.cols),
    cy: Math.floor((py / canvas.clientHeight) * renderer.rows),
  }
}

function toGround(px: number, py: number): THREE.Vector3 | null {
  const ndc = new THREE.Vector2(
    (px / canvas.clientWidth) * 2 - 1,
    -((py / canvas.clientHeight) * 2 - 1),
  )
  return world.pickGround(ndc)
}

function nearestUnit(x: number, z: number, maxDist: number): Unit | null {
  let best: Unit | null = null
  let bd = maxDist
  for (const u of game.units) {
    const d = Math.hypot(u.x - x, u.z - z)
    if (d < bd) { bd = d; best = u }
  }
  return best
}

function onAction(id: string) {
  // --- channels
  if (id.startsWith('chan:')) {
    ui.channel = id.slice(5) as Channel
    ui.detail = null
    ui.pendingSlot = -1
    return
  }
  if (id === 'dismiss') { ui.report = null; ui.status = 'READY'; return }

  // --- MAP
  if (id.startsWith('build:')) {
    const def = UNIT_BY_ID.get(id.slice(6))!
    ui.selectedDef = ui.selectedDef?.id === def.id ? null : def
    ui.selected = null
    world.clearGhost()
    ghostPos = null
    ui.status = ui.selectedDef ? `${def.name}: TAP TO PLACE` : 'READY'
    return
  }
  if (id === 'cancel') { ui.selectedDef = null; world.clearGhost(); ghostPos = null; return }
  if (id === 'page:+') { ui.buildPage++; return }
  if (id === 'page:-') { ui.buildPage--; return }
  if (id === 'aura') { ui.showAuras = !ui.showAuras; world.setAurasVisible(ui.showAuras); return }
  if (id === 'rot' && ui.selected) { ui.selected.rot += Math.PI / 8; return }
  if (id === 'del' && ui.selected) {
    game.remove(ui.selected)
    ui.status = 'SOLD'
    ui.selected = null
    return
  }
  if (id.startsWith('nudge:') && ui.selected) {
    // Sub-unit positioning: placement precision is bounded by intent, not cells.
    const step = 0.25
    const d = id.slice(6)
    const nx = ui.selected.x + (d === '-x' ? -step : d === '+x' ? step : 0)
    const nz = ui.selected.z + (d === '-z' ? -step : d === '+z' ? step : 0)
    ui.status = game.move(ui.selected, nx, nz)
      ? `@ ${nx.toFixed(2)}, ${nz.toFixed(2)}`
      : 'BLOCKED'
    return
  }

  // --- MACH
  if (id.startsWith('mach:')) {
    const uid = Number(id.slice(5))
    ui.detail = game.units.find((u) => u.id === uid) ?? null
    ui.pendingSlot = -1
    return
  }
  if (id === 'back') { ui.detail = null; ui.pendingSlot = -1; return }
  if (id.startsWith('slot:') && ui.detail) {
    const i = Number(id.slice(5))
    ui.pendingSlot = ui.pendingSlot === i ? -1 : i
    return
  }
  if (id === 'clearslot' && ui.detail && ui.pendingSlot >= 0) {
    game.uninstall(ui.detail, ui.pendingSlot)
    ui.status = 'REMOVED SYMBOL'
    return
  }
  if (id.startsWith('inv:') && ui.detail) {
    const symId = id.slice(4)
    if (ui.pendingSlot < 0) { ui.status = 'TAP A SLOT FIRST'; return }
    ui.status = game.install(ui.detail, ui.pendingSlot, symId) ? 'INSTALLED' : 'FAILED'
    ui.pendingSlot = -1
    return
  }
  if (id === 'draw') {
    const free = game.bankedPulls > 0
    if (free) game.bankedPulls--
    const got = game.draw(free)
    ui.status = got ? `DREW ${got.toUpperCase()}` : 'NOT ENOUGH CASH'
    return
  }

  // --- OPS
  if (id === 'cashout') {
    const n = game.cashout()
    if (n > 0) {
      ui.selected = null
      ui.detail = null
      ui.status = `CASHOUT ▸ +${n} CHIPS`
    }
    return
  }
  if (id.startsWith('up:')) {
    const upId = id.slice(3) as 'YIELD' | 'AURA' | 'RATE' | 'OFFLINE' | 'CAP'
    ui.status = game.buyUpgrade(upId) ? `${upId} UP` : 'NOT ENOUGH CHIPS'
    return
  }

  // --- SYS
  if (id === 'buytier') {
    if (game.buyTier()) { applyTier(); ui.status = `UPLINK ▸ T${game.tier}` }
    else ui.status = 'NOT ENOUGH BANDWIDTH'
    return
  }
  if (id === 'phos') {
    game.phosphor = (game.phosphor + 1) % PHOSPHORS.length
    renderer.setPhosphor(game.phosphor)
    return
  }
  if (id === 'export') {
    const blob = exportSave(snapshot())
    navigator.clipboard?.writeText(blob).then(
      () => { ui.status = 'SAVE COPIED TO CLIPBOARD' },
      () => { ui.status = 'CLIPBOARD DENIED' },
    )
    return
  }
  if (id === 'import') {
    navigator.clipboard?.readText().then(
      (txt) => {
        const d = importSave(txt)
        if (!d) { ui.status = 'CLIPBOARD NOT A SAVE'; return }
        applySave(d)
        ui.status = 'SAVE IMPORTED'
      },
      () => { ui.status = 'CLIPBOARD DENIED' },
    )
  }
}

let panning = false
let moving: Unit | null = null

new Gestures(canvas, {
  onTap(p) {
    const { cx, cy } = toCell(p.x, p.y)
    const region = screen.hit(cx, cy)
    if (region) { onAction(region); return }
    if (!screen.isWorldCell(ui, cy)) return

    const g = toGround(p.x, p.y)
    if (!g) return
    if (ui.selectedDef) {
      const placed = game.place(ui.selectedDef, g.x, g.z, ghostRot)
      if (placed) {
        ui.selected = placed
        ui.status = `PLACED ${ui.selectedDef.name}`
        if (game.cash < game.costOf(ui.selectedDef)) ui.selectedDef = null
      } else {
        ui.status = game.cash < game.costOf(ui.selectedDef) ? 'NOT ENOUGH CASH' : 'BLOCKED: OVERLAP'
      }
      world.clearGhost()
      ghostPos = null
      return
    }
    const near = nearestUnit(g.x, g.z, 3)
    ui.selected = near
    ui.status = near
      ? `${UNIT_BY_ID.get(near.defId)!.name} @ ${near.x.toFixed(2)}, ${near.z.toFixed(2)}`
      : 'READY'
  },

  onDragStart(p) {
    const { cy } = toCell(p.x, p.y)
    if (!screen.isWorldCell(ui, cy)) { panning = false; return }
    const g = toGround(p.x, p.y)
    if (!g) return
    if (ui.selectedDef) { ghostPos = { x: g.x, z: g.z }; return }
    const near = nearestUnit(g.x, g.z, 2.5)
    if (near) { ui.selected = near; moving = near; return }
    panning = true
  },

  onDragMove(p, d) {
    if (moving) {
      const g = toGround(p.x, p.y)
      if (g) game.move(moving, g.x, g.z)
      return
    }
    if (ui.selectedDef) {
      const g = toGround(p.x, p.y)
      if (g) ghostPos = { x: g.x, z: g.z }
      return
    }
    if (!panning) return
    const scale = (world.zoom * 2) / canvas.clientWidth
    const a = world.azimuth
    const right = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
    const fwd = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a))
    world.target.addScaledVector(right, -d.x * scale)
    world.target.addScaledVector(fwd, -d.y * scale * 1.6)
    world.updateCamera()
  },

  onDragEnd() {
    if (ui.selectedDef && ghostPos) {
      const placed = game.place(ui.selectedDef, ghostPos.x, ghostPos.z, ghostRot)
      ui.status = placed ? `PLACED ${ui.selectedDef.name}` : 'BLOCKED'
      if (placed) ui.selected = placed
      world.clearGhost()
      ghostPos = null
    }
    if (moving) ui.status = `MOVED @ ${moving.x.toFixed(2)}, ${moving.z.toFixed(2)}`
    moving = null
    panning = false
  },

  onPinch(scale, twist) {
    userZoom = Math.max(0.35, Math.min(3.5, userZoom / scale))
    world.zoom = tierZoom()
    world.azimuth += twist
    applyViewport()
    world.updateCamera()
  },

  onPinchEnd() {
    if (!TIERS[game.tier].freeOrbit) {
      const step = Math.PI / 2
      world.azimuth = Math.round(world.azimuth / step) * step
      world.updateCamera()
    }
  },
})

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------

let lastT = performance.now()
let frames = 0
let fpsAccum = 0

function frame(now: number) {
  const dt = Math.min(250, now - lastT)
  lastT = now
  frames++
  fpsAccum += dt
  if (fpsAccum >= 500) {
    ui.fps = (frames * 1000) / fpsAccum
    frames = 0
    fpsAccum = 0
  }

  sim.advance(dt)

  ui.delta = null
  if (ui.selectedDef && ghostPos) {
    const valid = game.canPlace(ui.selectedDef, ghostPos.x, ghostPos.z)
    world.showGhost(ui.selectedDef, ghostPos.x, ghostPos.z, ghostRot, valid)
    ui.delta = null
  }
  if (ui.selected && !game.units.includes(ui.selected)) ui.selected = null
  if (ui.detail && !game.units.includes(ui.detail)) ui.detail = null

  world.sync(game.units, ui.selected?.id ?? null, game.auraRangeMult)
  screen.draw(buf, game, ui)
  renderer.setOverlay(buf)
  renderer.render(world.scene, world.camera)
  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

function snapshot(): SaveData {
  return { v: SAVE_VERSION, t: Date.now(), game: game.serialize() }
}

function applySave(d: SaveData) {
  game.load(d.game)
  applyTier()
  ui.selected = null
  ui.detail = null
}

async function persist() {
  await save(snapshot())
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void persist()
})
setInterval(() => void persist(), 15000)

/**
 * Offline progress is derived from a timestamp, because iOS gives a web app no
 * background execution at all. Closed form rather than replayed ticks: four
 * hours of 10 Hz steps is 144,000 iterations and would stall the boot.
 */
function nightShift(elapsedMs: number): string[] | null {
  if (elapsedMs < 60_000) return null
  const income = game.income()
  const capped = Math.min(elapsedMs, game.offlineCapMs)
  const earned = income * (capped / 1000) * game.offlineRate
  game.cash += earned
  game.lifetimeCash += earned
  game.totalCash += earned
  game.heat = Math.max(0, game.heat - (capped / 1000) * 0.012)
  game.bankedPulls++

  const lines = [
    `> UPLINK RESTORED.`,
    `> ${fmtDuration(elapsedMs)} ELAPSED.`,
    '',
    `  YIELD    ${fmt(income)}/s`,
    `  NIGHT    ${Math.round(game.offlineRate * 100)}%`,
    `  COUNTED  ${fmtDuration(capped)}${capped < elapsedMs ? ' (CAPPED)' : ''}`,
    '',
    `TOTAL ▸ ${fmt(earned)} ¢`,
    '',
    `  1 BANKED PULL AVAILABLE`,
  ]
  return lines
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`
}

async function boot() {
  resize()
  const saved = await load()
  if (saved?.game) {
    game.load(saved.game)
    const elapsed = Date.now() - (saved.t ?? Date.now())
    ui.report = nightShift(elapsed)
    ui.status = ui.report ? 'NIGHT SHIFT' : 'READY'
  } else {
    // Enough to buy the first machine immediately: a new player must reach
    // their first payout inside 20 seconds (features.md section 8).
    game.cash = 40
    ui.status = 'TAP [SLT1] THEN THE GROUND'
  }
  applyTier()
  void requestPersistence()
  requestAnimationFrame(frame)
}

registerServiceWorker()
void boot()

// Debug/test hooks for the verification harness.
;(window as unknown as Record<string, unknown>).__bauda = {
  game,
  setTier(i: number) { game.tier = i; applyTier() },
  setChannel(c: Channel) { ui.channel = c },
  setPhosphor(i: number) { game.phosphor = i; renderer.setPhosphor(i) },
  setAzimuth(a: number) { world.azimuth = a; world.updateCamera() },
  dump: () => renderer.dumpText(),
  grid: () => ({ cols: renderer.cols, rows: renderer.rows }),
  missingGlyphs: () => renderer.atlas.missing,
  fps: () => ui.fps,
  income: () => game.income(),
  place: (id: string, x: number, z: number, r = 0) =>
    !!game.place(UNIT_BY_ID.get(id)!, x, z, r, true),
  give: (n: number) => { game.cash += n; game.totalCash += n },
  step: (n: number) => { for (let i = 0; i < n; i++) game.step() },
  tickMs: TICK_MS,
  act: (id: string) => onAction(id),
  regions: () => screen.regions.map((r) => r.id),
  autoplay,
  exportSave: () => exportSave(snapshot()),
  importSave: (b: string) => importSave(b),
  reset: () => { game.load({ ...game.serialize(), units: [], cash: 40 } as never) },
}

function seedDemo(defId: string, x: number, z: number, rot: number) {
  game.place(UNIT_BY_ID.get(defId)!, x, z, rot, true)
}
;(window as unknown as Record<string, unknown>).__seedDemo = seedDemo
