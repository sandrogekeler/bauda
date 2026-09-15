import * as THREE from 'three'

export type AuraKind = 'GLAMOUR' | 'TRAFFIC' | 'LUCK' | 'SECURITY' | 'NOISE' | 'POWER'

export interface BuildingDef {
  id: string
  label: string
  /** Collision radius in world units. */
  footprint: number
  auraKind: AuraKind
  auraRadius: number
  auraStrength: number
  base: number
  build: (m: THREE.Material) => THREE.Group
}

/**
 * Every mesh here is assembled from primitives. The ASCII pass discards fine
 * detail anyway, so what matters is a readable silhouette and a couple of
 * strong planes (features.md section 2.3). This is the cheap-art claim being
 * tested in practice.
 */
function g(...parts: THREE.Mesh[]): THREE.Group {
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

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'slot', label: 'SLOT', footprint: 1.6, auraKind: 'GLAMOUR',
    auraRadius: 6, auraStrength: 1, base: 12,
    build: (m) => g(
      box(m, 2.2, 2.6, 2.2),
      box(m, 2.6, 0.35, 2.6, 0, 2.6),
      box(m, 0.35, 1.4, 0.35, 0, 2.95),
      box(m, 1.2, 0.2, 0.1, 0, 4.1),
    ),
  },
  {
    id: 'pinball', label: 'PINB', footprint: 2.0, auraKind: 'TRAFFIC',
    auraRadius: 7, auraStrength: 1, base: 9,
    build: (m) => {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 4.4), m)
      ramp.position.set(0, 1.1, 0)
      ramp.rotation.x = -0.32
      return g(box(m, 3.0, 0.9, 4.0), ramp, box(m, 0.4, 1.8, 0.4, -1.2, 1.4, -1.8),
        box(m, 0.4, 1.8, 0.4, 1.2, 1.4, -1.8))
    },
  },
  {
    id: 'wheel', label: 'WHEL', footprint: 1.8, auraKind: 'LUCK',
    auraRadius: 6.5, auraStrength: 1, base: 10,
    build: (m) => {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.4, 12), m)
      disc.position.set(0, 3.0, 0)
      disc.rotation.x = Math.PI / 2
      return g(box(m, 0.6, 3.0, 0.6), disc, cone(m, 0.4, 0.8, 4, 0, 5.1))
    },
  },
  {
    id: 'mega', label: 'MEGA', footprint: 3.2, auraKind: 'GLAMOUR',
    auraRadius: 11, auraStrength: 2.2, base: 60,
    build: (m) => g(
      box(m, 5.0, 1.0, 5.0),
      box(m, 3.6, 5.0, 3.6, 0, 1.0),
      box(m, 4.4, 0.6, 4.4, 0, 6.0),
      cyl(m, 0.5, 3.0, 6, 0, 6.6),
      cone(m, 1.1, 1.6, 6, 0, 9.6),
    ),
  },
  {
    id: 'power', label: 'PWR', footprint: 2.4, auraKind: 'POWER',
    auraRadius: 9, auraStrength: 1.6, base: 0,
    build: (m) => g(
      box(m, 3.6, 1.6, 3.6),
      cyl(m, 1.0, 5.5, 8, -0.8, 1.6),
      cyl(m, 0.7, 4.0, 8, 1.1, 1.6, 0.6),
      box(m, 0.3, 0.3, 2.4, 0, 1.0, 2.2),
    ),
  },
  {
    id: 'security', label: 'SEC', footprint: 1.2, auraKind: 'SECURITY',
    auraRadius: 8, auraStrength: 1.4, base: 0,
    build: (m) => g(
      box(m, 1.8, 1.2, 1.8),
      cyl(m, 0.45, 4.5, 6, 0, 1.2),
      box(m, 1.4, 0.5, 1.4, 0, 5.7),
    ),
  },
]

export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]))
