import * as THREE from 'three'

export type AuraKind = 'GLAMOUR' | 'TRAFFIC' | 'LUCK' | 'SECURITY' | 'NOISE' | 'POWER'
export type Family = 'SLOT' | 'WHEEL' | 'SUPPORT'

export interface Aura {
  kind: AuraKind
  radius: number
  strength: number
}

export interface UnitDef {
  id: string
  /** Short label for the 40-column build palette. */
  label: string
  name: string
  family: Family
  footprint: number
  auras: Aura[]
  cost: number
  /** Cost multiplier per copy already owned. */
  costGrowth: number
  /** Symbol slots. 0 for support structures. */
  slots: number
  gridWidth: number
  /** Seconds between spins, before TRAFFIC. */
  period: number
  /** Multiplies the resolved symbol total. */
  scale: number
  /** Runs at a third rate without POWER coverage. */
  needsPower: boolean
  /** Lifetime cash before this appears in the palette. */
  unlockAt: number
  build: (m: THREE.Material) => THREE.Group
}

function g(...parts: THREE.Object3D[]): THREE.Group {
  const grp = new THREE.Group()
  for (const p of parts) grp.add(p)
  return grp
}

function box(m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y + h / 2, z)
  return mesh
}

function cyl(m: THREE.Material, r: number, h: number, seg = 8, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m)
  mesh.position.set(x, y + h / 2, z)
  return mesh
}

function cone(m: THREE.Material, r: number, h: number, seg = 6, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m)
  mesh.position.set(x, y + h / 2, z)
  return mesh
}

function disc(m: THREE.Material, r: number, t: number, seg: number, y: number) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, seg), m)
  mesh.position.set(0, y, 0)
  mesh.rotation.x = Math.PI / 2
  return mesh
}

/**
 * Fifteen archetypes across three families. Every mesh is assembled from
 * primitives: the ASCII pass discards fine detail, so a readable silhouette and
 * a couple of strong planes is the whole brief (features.md section 2.3).
 *
 * Costs and rates are tuned so that the early curve moves fast - first payout
 * inside 20 seconds, first machine inside a minute - and each family has a
 * distinct feel: SLOT is wide and frequent, WHEEL is narrow, slow and heavy.
 */
export const UNITS: UnitDef[] = [
  // ---- SLOT: wide grids, frequent spins ---------------------------------
  {
    id: 'slot1', label: 'SLT1', name: 'SLOT-I', family: 'SLOT',
    footprint: 1.5, cost: 25, costGrowth: 1.16, slots: 3, gridWidth: 3,
    period: 3.0, scale: 1.0, needsPower: false, unlockAt: 0,
    auras: [{ kind: 'GLAMOUR', radius: 5.5, strength: 0.5 }],
    build: (m) => g(box(m, 2.0, 2.4, 2.0), box(m, 2.4, 0.3, 2.4, 0, 2.4), box(m, 0.3, 1.2, 0.3, 0, 2.7)),
  },
  {
    id: 'slot2', label: 'SLT2', name: 'SLOT-II', family: 'SLOT',
    footprint: 1.9, cost: 260, costGrowth: 1.17, slots: 6, gridWidth: 3,
    period: 3.4, scale: 1.2, needsPower: false, unlockAt: 400,
    auras: [{ kind: 'GLAMOUR', radius: 6.5, strength: 0.7 }],
    build: (m) => g(box(m, 3.0, 2.8, 2.2), box(m, 3.4, 0.35, 2.6, 0, 2.8),
      box(m, 0.3, 1.4, 0.3, -1.0, 3.15), box(m, 0.3, 1.4, 0.3, 1.0, 3.15)),
  },
  {
    id: 'neon', label: 'NEON', name: 'NEON STRIP', family: 'SLOT',
    footprint: 1.7, cost: 1100, costGrowth: 1.18, slots: 6, gridWidth: 3,
    period: 2.3, scale: 1.1, needsPower: false, unlockAt: 1600,
    auras: [{ kind: 'GLAMOUR', radius: 9.0, strength: 1.5 }, { kind: 'NOISE', radius: 4.0, strength: 0.4 }],
    build: (m) => g(box(m, 2.4, 1.6, 2.4), cyl(m, 0.3, 5.5, 6, 0, 1.6),
      box(m, 3.2, 0.3, 0.3, 0, 5.0), box(m, 0.3, 0.3, 3.2, 0, 5.8)),
  },
  {
    id: 'slot3', label: 'SLT3', name: 'SLOT-III', family: 'SLOT',
    footprint: 2.2, cost: 2400, costGrowth: 1.18, slots: 9, gridWidth: 3,
    period: 4.0, scale: 1.45, needsPower: false, unlockAt: 4000,
    auras: [{ kind: 'GLAMOUR', radius: 7.5, strength: 0.9 }],
    build: (m) => g(box(m, 3.6, 3.4, 2.6), box(m, 4.0, 0.4, 3.0, 0, 3.4),
      box(m, 0.35, 1.6, 0.35, -1.3, 3.8), box(m, 0.35, 1.6, 0.35, 0, 3.8),
      box(m, 0.35, 1.6, 0.35, 1.3, 3.8)),
  },
  {
    id: 'vault', label: 'VALT', name: 'VAULT BOX', family: 'SLOT',
    footprint: 2.0, cost: 9000, costGrowth: 1.2, slots: 4, gridWidth: 2,
    period: 6.5, scale: 3.0, needsPower: true, unlockAt: 15000,
    auras: [{ kind: 'GLAMOUR', radius: 6.0, strength: 1.1 }],
    build: (m) => g(box(m, 3.2, 3.2, 3.2), disc(m, 1.1, 0.4, 10, 1.6),
      box(m, 3.6, 0.4, 3.6, 0, 3.2), box(m, 1.0, 0.8, 1.0, 0, 3.6)),
  },
  {
    id: 'cascade', label: 'CASC', name: 'CASCADE', family: 'SLOT',
    footprint: 2.6, cost: 34000, costGrowth: 1.19, slots: 9, gridWidth: 3,
    period: 1.9, scale: 1.25, needsPower: true, unlockAt: 60000,
    auras: [{ kind: 'TRAFFIC', radius: 8.0, strength: 1.2 }, { kind: 'NOISE', radius: 6.0, strength: 0.9 }],
    build: (m) => g(box(m, 4.4, 1.2, 4.4), box(m, 3.6, 1.2, 3.6, 0, 1.2),
      box(m, 2.8, 1.2, 2.8, 0, 2.4), box(m, 2.0, 1.2, 2.0, 0, 3.6),
      cyl(m, 0.35, 2.4, 6, 0, 4.8)),
  },
  {
    id: 'grand', label: 'GRND', name: 'GRAND ROW', family: 'SLOT',
    footprint: 3.4, cost: 180000, costGrowth: 1.2, slots: 12, gridWidth: 3,
    period: 5.0, scale: 2.2, needsPower: true, unlockAt: 320000,
    auras: [{ kind: 'GLAMOUR', radius: 11.0, strength: 2.0 }],
    build: (m) => g(box(m, 6.0, 1.0, 4.4), box(m, 5.2, 4.6, 3.6, 0, 1.0),
      box(m, 6.0, 0.5, 4.4, 0, 5.6), cyl(m, 0.4, 2.6, 6, -1.8, 6.1),
      cyl(m, 0.4, 2.6, 6, 1.8, 6.1), cone(m, 1.0, 1.6, 6, 0, 6.1)),
  },

  // ---- WHEEL: few slots, slow, heavy -------------------------------------
  {
    id: 'wheel1', label: 'WHL1', name: 'WHEEL', family: 'WHEEL',
    footprint: 1.7, cost: 140, costGrowth: 1.18, slots: 2, gridWidth: 2,
    period: 5.0, scale: 2.4, needsPower: false, unlockAt: 200,
    auras: [{ kind: 'LUCK', radius: 6.5, strength: 0.9 }],
    build: (m) => g(box(m, 0.6, 2.8, 0.6), disc(m, 1.8, 0.35, 12, 2.9), cone(m, 0.35, 0.7, 4, 0, 4.7)),
  },
  {
    id: 'wheel2', label: 'WHL2', name: 'BIG WHEEL', family: 'WHEEL',
    footprint: 2.3, cost: 3200, costGrowth: 1.19, slots: 3, gridWidth: 3,
    period: 7.0, scale: 3.8, needsPower: false, unlockAt: 6000,
    auras: [{ kind: 'LUCK', radius: 8.5, strength: 1.4 }],
    build: (m) => g(box(m, 1.0, 1.0, 1.0), box(m, 0.7, 4.0, 0.7, 0, 1.0),
      disc(m, 2.8, 0.45, 14, 4.6), cone(m, 0.4, 0.9, 4, 0, 7.2)),
  },
  {
    id: 'fortune', label: 'FORT', name: 'FORTUNE', family: 'WHEEL',
    footprint: 2.6, cost: 26000, costGrowth: 1.2, slots: 4, gridWidth: 2,
    period: 9.0, scale: 6.0, needsPower: true, unlockAt: 45000,
    auras: [{ kind: 'LUCK', radius: 10.0, strength: 2.0 }],
    build: (m) => g(box(m, 3.4, 1.0, 3.4), box(m, 0.8, 5.0, 0.8, 0, 1.0),
      disc(m, 3.4, 0.5, 16, 6.0), disc(m, 1.4, 0.7, 8, 6.0)),
  },
  {
    id: 'megawheel', label: 'MEGA', name: 'MEGA WHEEL', family: 'WHEEL',
    footprint: 3.6, cost: 260000, costGrowth: 1.21, slots: 6, gridWidth: 3,
    period: 12.0, scale: 11.0, needsPower: true, unlockAt: 500000,
    auras: [{ kind: 'LUCK', radius: 13.0, strength: 3.0 }, { kind: 'NOISE', radius: 7.0, strength: 1.0 }],
    build: (m) => g(box(m, 5.0, 1.2, 5.0), box(m, 1.0, 6.5, 1.0, 0, 1.2),
      disc(m, 4.6, 0.6, 18, 7.8), disc(m, 2.2, 0.9, 10, 7.8),
      cyl(m, 0.3, 2.0, 6, 0, 11.2)),
  },

  // ---- SUPPORT: no slots, all aura ---------------------------------------
  {
    id: 'plaza', label: 'PLAZ', name: 'PLAZA', family: 'SUPPORT',
    footprint: 1.6, cost: 90, costGrowth: 1.15, slots: 0, gridWidth: 1,
    period: 0, scale: 0, needsPower: false, unlockAt: 120,
    auras: [{ kind: 'GLAMOUR', radius: 8.0, strength: 1.3 }],
    build: (m) => g(box(m, 3.4, 0.35, 3.4), cyl(m, 0.3, 2.2, 6, -1.0, 0.35),
      cyl(m, 0.3, 2.2, 6, 1.0, 0.35), box(m, 2.6, 0.25, 0.4, 0, 2.55)),
  },
  {
    id: 'billboard', label: 'BILL', name: 'BILLBOARD', family: 'SUPPORT',
    footprint: 1.2, cost: 240, costGrowth: 1.16, slots: 0, gridWidth: 1,
    period: 0, scale: 0, needsPower: false, unlockAt: 500,
    auras: [{ kind: 'TRAFFIC', radius: 9.0, strength: 1.5 }],
    build: (m) => g(box(m, 1.4, 0.5, 1.4), box(m, 0.35, 3.4, 0.35, -0.7, 0.5),
      box(m, 0.35, 3.4, 0.35, 0.7, 0.5), box(m, 3.0, 2.0, 0.25, 0, 3.4)),
  },
  {
    id: 'power', label: 'PWR', name: 'POWER PLANT', family: 'SUPPORT',
    footprint: 2.3, cost: 700, costGrowth: 1.17, slots: 0, gridWidth: 1,
    period: 0, scale: 0, needsPower: false, unlockAt: 900,
    auras: [{ kind: 'POWER', radius: 10.0, strength: 1.0 }, { kind: 'NOISE', radius: 6.5, strength: 1.1 }],
    build: (m) => g(box(m, 3.4, 1.6, 3.4), cyl(m, 0.95, 5.5, 8, -0.8, 1.6),
      cyl(m, 0.65, 4.0, 8, 1.0, 1.6, 0.6), box(m, 0.3, 0.3, 2.2, 0, 1.0, 2.0)),
  },
  {
    id: 'security', label: 'SEC', name: 'SECURITY', family: 'SUPPORT',
    footprint: 1.1, cost: 900, costGrowth: 1.18, slots: 0, gridWidth: 1,
    period: 0, scale: 0, needsPower: false, unlockAt: 1400,
    auras: [{ kind: 'SECURITY', radius: 9.0, strength: 1.4 }],
    build: (m) => g(box(m, 1.6, 1.0, 1.6), cyl(m, 0.4, 4.5, 6, 0, 1.0),
      box(m, 1.3, 0.45, 1.3, 0, 5.5), cone(m, 0.5, 0.7, 4, 0, 5.95)),
  },
]

export const UNIT_BY_ID = new Map(UNITS.map((u) => [u.id, u]))

/** Cost of the next copy, given how many are already placed. */
export function unitCost(def: UnitDef, owned: number): number {
  return Math.ceil(def.cost * Math.pow(def.costGrowth, owned))
}
