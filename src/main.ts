import * as THREE from 'three'
import { AsciiRenderer } from './render/asciiRenderer'
import { PHOSPHORS, TIERS } from './render/tiers'
import { CellBuffer } from './ui/cellBuffer'
import { Hud } from './ui/hud'
import { World } from './world/world'
import { BUILDING_BY_ID, BUILDINGS, type BuildingDef } from './world/buildings'
import { Gestures } from './input/gestures'
import { Rng } from './sim/rng'
import { SimLoop, TICK_MS } from './sim/loop'
import { exportSave, importSave, load, save, SAVE_VERSION, type SaveData } from './save/save'
import { registerServiceWorker } from './pwa'

const canvas = document.getElementById('view') as HTMLCanvasElement

const renderer = new AsciiRenderer(canvas)
const world = new World()
const buf = new CellBuffer()
const hud = new Hud()

let tierIndex = 2
/** Player pinch-zoom, applied on top of the per-tier baseline. */
let userZoom = 1
let phosphorIndex = 0
let selectedDef: BuildingDef | null = null
let selected: ReturnType<World['place']> = null
let ghostPos: { x: number; z: number } | null = null
let ghostRot = 0
let status = 'READY'
let showAuras = true

let cash = 0
const seed = 0x5eed
const rng = new Rng(seed)

const sim = new SimLoop(() => {
  cash += world.income() * (TICK_MS / 1000)
})

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

const BASE_ZOOM = 12

/**
 * Low tiers zoom in. At 40 columns a whole district is an unreadable smear -
 * verified, not assumed - so fewer, larger buildings is the only way tier 0
 * stays playable. The exponent is deliberately below 1: higher tiers still show
 * noticeably more of the city, they just do not scale it away entirely.
 */
function tierZoom(): number {
  return BASE_ZOOM * Math.pow(TIERS[tierIndex].cols / 64, 0.6) * userZoom
}

function applyTier() {
  renderer.setTier(TIERS[tierIndex])
  renderer.setPhosphor(phosphorIndex)
  buf.resize(renderer.cols, renderer.rows)
  world.zoom = tierZoom()
  applyViewport()
  world.updateCamera()
}

function applyViewport() {
  const aspect = canvas.clientWidth / canvas.clientHeight
  world.setViewport(aspect, renderer.rows, Hud.TOP, Hud.BOTTOM)
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

function inViewport(cy: number) {
  return cy >= Hud.TOP && cy < renderer.rows - Hud.BOTTOM
}

/** Screen point to ground point. */
function toGround(px: number, py: number): THREE.Vector3 | null {
  // The camera covers the whole canvas (the frustum is offset for the chrome),
  // so screen position maps straight to NDC.
  const ndc = new THREE.Vector2(
    (px / canvas.clientWidth) * 2 - 1,
    -((py / canvas.clientHeight) * 2 - 1),
  )
  return world.pickGround(ndc)
}

function onAction(id: string) {
  if (id.startsWith('build:')) {
    const def = BUILDING_BY_ID.get(id.slice(6))!
    selectedDef = selectedDef?.id === def.id ? null : def
    selected = null
    world.clearGhost()
    ghostPos = null
    status = selectedDef ? `${selectedDef.label}: TAP OR DRAG IN VIEW` : 'READY'
    return
  }
  if (id.startsWith('tier:')) {
    tierIndex = Math.max(0, Math.min(TIERS.length - 1, tierIndex + (id === 'tier:+' ? 1 : -1)))
    applyTier()
    status = `UPLINK ▸ ${TIERS[tierIndex].name}`
    return
  }
  if (id === 'phosphor') {
    phosphorIndex = (phosphorIndex + 1) % PHOSPHORS.length
    renderer.setPhosphor(phosphorIndex)
    return
  }
  if (id === 'aura') {
    showAuras = !showAuras
    world.setAurasVisible(showAuras)
    return
  }
  if (!selected) return
  if (id === 'del') {
    world.remove(selected)
    selected = null
    status = 'REMOVED'
    return
  }
  if (id === 'rot') {
    selected.rot += Math.PI / 8
    selected.group.rotation.y = selected.rot
    return
  }
  if (id.startsWith('nudge:')) {
    // Sub-unit positioning: proves placement precision is bounded by intent,
    // not by the character grid.
    const step = 0.25
    const d = id.slice(6)
    const dx = d === '-x' ? -step : d === '+x' ? step : 0
    const dz = d === '-z' ? -step : d === '+z' ? step : 0
    const def = BUILDING_BY_ID.get(selected.defId)!
    const nx = selected.x + dx
    const nz = selected.z + dz
    const was = { x: selected.x, z: selected.z }
    selected.x = -999; selected.z = -999
    const ok = world.canPlace(def, nx, nz)
    selected.x = was.x; selected.z = was.z
    if (!ok) { status = 'BLOCKED'; return }
    selected.x = nx
    selected.z = nz
    selected.group.position.set(nx, 0, nz)
    world.refreshAuras()
    status = `${def.label} @ ${nx.toFixed(2)}, ${nz.toFixed(2)}`
  }
}

let panning = false
let movingId: number | null = null

new Gestures(canvas, {
  onTap(p) {
    const { cx, cy } = toCell(p.x, p.y)
    const region = hud.hit(cx, cy)
    if (region) { onAction(region); return }
    if (!inViewport(cy)) return

    const g = toGround(p.x, p.y)
    if (!g) return
    if (selectedDef) {
      const placed = world.place(selectedDef, g.x, g.z, ghostRot)
      status = placed ? `PLACED ${selectedDef.label}` : 'BLOCKED: OVERLAP'
      if (placed) selected = placed
      world.clearGhost()
      ghostPos = null
      return
    }
    const near = world.nearest(g.x, g.z, 3)
    selected = near
    status = near
      ? `${BUILDING_BY_ID.get(near.defId)!.label} @ ${near.x.toFixed(2)}, ${near.z.toFixed(2)}`
      : 'READY'
  },

  onDragStart(p) {
    const { cy } = toCell(p.x, p.y)
    if (!inViewport(cy)) { panning = false; return }
    const g = toGround(p.x, p.y)
    if (!g) return
    if (selectedDef) { ghostPos = { x: g.x, z: g.z }; return }
    const near = world.nearest(g.x, g.z, 2.5)
    if (near) { selected = near; movingId = near.id; return }
    panning = true
  },

  onDragMove(p, d) {
    if (movingId !== null && selected) {
      const g = toGround(p.x, p.y)
      if (!g) return
      selected.x = g.x
      selected.z = g.z
      selected.group.position.set(g.x, 0, g.z)
      world.refreshAuras()
      return
    }
    if (selectedDef) {
      const g = toGround(p.x, p.y)
      if (g) ghostPos = { x: g.x, z: g.z }
      return
    }
    if (!panning) return
    const scale = (world.zoom * 2) / canvas.clientHeight
    const a = world.azimuth
    const right = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
    const fwd = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a))
    world.target.addScaledVector(right, -d.x * scale)
    world.target.addScaledVector(fwd, -d.y * scale * 1.6)
    world.updateCamera()
  },

  onDragEnd(p) {
    if (selectedDef && ghostPos) {
      const placed = world.place(selectedDef, ghostPos.x, ghostPos.z, ghostRot)
      status = placed ? `PLACED ${selectedDef.label}` : 'BLOCKED: OVERLAP'
      if (placed) selected = placed
      world.clearGhost()
      ghostPos = null
    }
    if (movingId !== null && selected) {
      const def = BUILDING_BY_ID.get(selected.defId)!
      status = `MOVED ${def.label} @ ${selected.x.toFixed(2)}, ${selected.z.toFixed(2)}`
    }
    movingId = null
    panning = false
    void p
  },

  onPinch(scale, twist) {
    userZoom = Math.max(0.35, Math.min(3.5, userZoom / scale))
    world.zoom = tierZoom()
    world.azimuth += twist
    applyViewport()
    world.updateCamera()
  },

  onPinchEnd() {
    if (!TIERS[tierIndex].freeOrbit) {
      // Below tier 3 the camera snaps to four fixed steps, which keeps spatial
      // memory intact (features.md section 15.6).
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
let fps = 60
let frames = 0
let fpsAccum = 0

function frame(now: number) {
  const dt = Math.min(250, now - lastT)
  lastT = now

  frames++
  fpsAccum += dt
  if (fpsAccum >= 500) {
    fps = (frames * 1000) / fpsAccum
    frames = 0
    fpsAccum = 0
  }

  sim.advance(dt)

  let delta: number | null = null
  if (selectedDef && ghostPos) {
    world.showGhost(selectedDef, ghostPos.x, ghostPos.z, ghostRot)
    delta = world.incomeWith(selectedDef, ghostPos.x, ghostPos.z) - world.income()
  }

  hud.draw(buf, {
    tier: TIERS[tierIndex],
    phosphorName: PHOSPHORS[phosphorIndex].name,
    cols: renderer.cols,
    rows: renderer.rows,
    fps,
    cash,
    income: world.income(),
    heat: Math.min(1, world.placed.length / 24),
    selectedDef: selectedDef?.id ?? null,
    placedCount: world.placed.length,
    delta,
    status,
    showAuras,
    hasSelection: !!selected,
  })

  renderer.setOverlay(buf)
  renderer.render(world.scene, world.camera)
  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

function snapshot(): SaveData {
  return {
    v: SAVE_VERSION,
    t: Date.now(),
    tier: tierIndex,
    phosphor: phosphorIndex,
    seed,
    rngState: rng.state,
    buildings: world.serialize(),
    cash,
  }
}

async function persist() {
  await save(snapshot())
}

document.addEventListener('visibilitychange', () => {
  // iOS kills backgrounded web apps without warning; beforeunload is unreliable.
  if (document.visibilityState === 'hidden') void persist()
})
setInterval(() => void persist(), 15000)

function seedDemoDistrict() {
  // A starting layout so the very first frame has something to look at, and so
  // the legibility test has consistent subject matter.
  const layout: [string, number, number, number][] = [
    ['mega', 0, 0, 0.4],
    ['slot', -6.2, -2.2, 0], ['slot', -6.4, 2.4, 0.2], ['slot', -3.2, 5.6, 0],
    ['slot', 5.0, -4.6, 0.8], ['wheel', 6.4, 2.4, 0], ['wheel', -9.4, 4.6, 0.5],
    ['pinball', 2.4, 7.2, 0.1], ['pinball', -2.4, -7.2, 1.2],
    ['power', 9.8, -6.2, 0.3], ['security', -10.6, -5.0, 0], ['security', 9.4, 6.8, 0],
  ]
  for (const [id, x, z, r] of layout) {
    const def = BUILDINGS.find((b) => b.id === id)!
    world.place(def, x, z, r)
  }
}

async function boot() {
  resize()
  const saved = await load()
  if (saved) {
    tierIndex = Math.min(TIERS.length - 1, saved.tier ?? 2)
    phosphorIndex = saved.phosphor ?? 0
    cash = saved.cash ?? 0
    rng.state = saved.rngState || seed
    world.load(saved.buildings ?? [])
    const elapsed = Date.now() - (saved.t ?? Date.now())
    if (elapsed > 5000) {
      const { steps } = sim.catchUp(elapsed, 4 * 3600 * 1000)
      status = `UPLINK RESTORED · ${fmtDuration(elapsed)} · ${steps} TICKS`
    }
    applyTier()
  } else {
    seedDemoDistrict()
  }
  requestAnimationFrame(frame)
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

registerServiceWorker()
void boot()

// Test/debug hooks. Used by the Playwright harness to answer the Phase 0
// questions without a human squinting at a screenshot.
;(window as unknown as Record<string, unknown>).__bauda = {
  setTier(i: number) { tierIndex = i; applyTier() },
  setPhosphor(i: number) { phosphorIndex = i; renderer.setPhosphor(i) },
  setAzimuth(a: number) { world.azimuth = a; world.updateCamera() },
  setZoom(z: number) { userZoom = z / tierZoom() * userZoom; world.zoom = tierZoom(); applyViewport(); world.updateCamera() },
  dump: () => renderer.dumpText(),
  grid: () => ({ cols: renderer.cols, rows: renderer.rows }),
  missingGlyphs: () => renderer.atlas.missing,
  fps: () => fps,
  income: () => world.income(),
  place: (id: string, x: number, z: number, r = 0) =>
    !!world.place(BUILDING_BY_ID.get(id)!, x, z, r),
  reset: () => { world.load([]); seedDemoDistrict() },
  exportSave: () => exportSave(snapshot()),
  importSave: (b: string) => importSave(b),
}
