import * as THREE from 'three'
import { BUILDING_BY_ID, BUILDINGS, type BuildingDef } from './buildings'

export interface Placed {
  id: number
  defId: string
  /** Continuous world coordinates. No grid, no snapping. */
  x: number
  z: number
  rot: number
  group: THREE.Group
}

const MAX_AURAS = 48
const EMPTY_GROUP = new THREE.Group()

/**
 * The 3D district. Buildings sit at float coordinates with float aura radii;
 * the character grid is only the display resolution, so placement precision is
 * bounded by zoom and raycast rather than by cells (features.md section 2.2).
 */
export class World {
  scene = new THREE.Scene()
  camera: THREE.OrthographicCamera
  placed: Placed[] = []
  ghost: THREE.Group | null = null
  ghostValid = true

  /** Camera rig. */
  target = new THREE.Vector3(0, 0, 0)
  azimuth = Math.PI * 0.25
  pitch = 0.85          // ~49 degrees. Shallower angles project a square
                        // district into a squat rhombus that wastes a portrait screen.
  zoom = 12

  private matBuilding: THREE.MeshLambertMaterial
  private matGhost: THREE.MeshLambertMaterial
  private matGhostBad: THREE.MeshLambertMaterial
  private groundMat: THREE.ShaderMaterial
  private nextId = 1
  private auraData = new Float32Array(MAX_AURAS * 4)

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)

    this.scene.background = new THREE.Color(0x000000)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.34))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(6, 12, 4)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.45)
    fill.position.set(-8, 5, -6)
    this.scene.add(fill)

    this.matBuilding = new THREE.MeshLambertMaterial({ color: 0xffffff })
    this.matGhost = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    this.matGhostBad = new THREE.MeshLambertMaterial({ color: 0x552222, transparent: true, opacity: 0.55 })

    this.groundMat = new THREE.ShaderMaterial({
      uniforms: {
        uAuras: { value: this.auraData },
        uAuraCount: { value: 0 },
        uShowAuras: { value: 1 },
        uPlotRadius: { value: 34 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vPos;
        void main() {
          vPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vPos;
        uniform vec4 uAuras[${MAX_AURAS}];
        uniform int uAuraCount;
        uniform float uShowAuras;
        uniform float uPlotRadius;

        void main() {
          // Aura density is rendered as ground emission; the luminance ramp in
          // the ASCII pass turns it into character density for free.
          float d = 0.0;
          if (uShowAuras > 0.5) {
            for (int i = 0; i < ${MAX_AURAS}; i++) {
              if (i >= uAuraCount) break;
              vec4 a = uAuras[i];
              float dist = length(vPos - a.xy);
              float f = 1.0 - smoothstep(0.0, a.z, dist);
              d += f * f * f * a.w;
            }
          }
          d = d / (1.0 + d);                       // diminishing returns
          float r = length(vPos);
          float plot = 1.0 - smoothstep(uPlotRadius - 1.2, uPlotRadius, r);
          float grid = 0.0;
          float base = 0.015 + 0.115 * d;
          gl_FragColor = vec4(vec3(base + grid) * plot, 1.0);
        }
      `,
    })

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), this.groundMat)
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    this.updateCamera()
  }

  updateCamera() {
    const d = 90
    const a = this.azimuth
    const p = this.pitch
    this.camera.position.set(
      this.target.x + Math.cos(a) * Math.cos(p) * d,
      this.target.y + Math.sin(p) * d,
      this.target.z + Math.sin(a) * Math.cos(p) * d,
    )
    this.camera.lookAt(this.target)
    this.camera.updateMatrixWorld()
  }

  /**
   * The scene is rendered across the whole canvas, but chrome covers rows at the
   * top and bottom. An asymmetric frustum frames the district inside the
   * *visible band* instead of the canvas centre, so the city is not sitting
   * half-hidden behind the control panel.
   */
  setViewport(canvasAspect: number, rows: number, topRows: number, bottomRows: number) {
    // zoom is half-WIDTH in world units. Deriving it from height instead makes
    // the visible width collapse on a 0.46-aspect phone and clips the district.
    const visible = Math.max(4, rows - topRows - bottomRows)
    const frac = visible / rows
    const halfW = this.zoom
    const halfH = halfW / canvasAspect
    const dy = -halfH * ((bottomRows - topRows) / rows)
    void frac
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH + dy
    this.camera.bottom = -halfH + dy
    this.camera.near = 0.1
    this.camera.far = 400
    this.camera.updateProjectionMatrix()
  }

  /** Raycast a normalized device coordinate onto the ground plane. */
  pickGround(ndc: THREE.Vector2): THREE.Vector3 | null {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    return ray.ray.intersectPlane(plane, hit) ? hit : null
  }

  showGhost(def: BuildingDef, x: number, z: number, rot: number) {
    if (!this.ghost || this.ghost.userData.defId !== def.id) {
      this.clearGhost()
      this.ghost = def.build(this.matGhost)
      this.ghost.userData.defId = def.id
      this.scene.add(this.ghost)
    }
    this.ghostValid = this.canPlace(def, x, z)
    const mat = this.ghostValid ? this.matGhost : this.matGhostBad
    this.ghost.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat })
    this.ghost.position.set(x, 0, z)
    this.ghost.rotation.y = rot
  }

  clearGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost)
      disposeGroup(this.ghost)
      this.ghost = null
    }
  }

  canPlace(def: BuildingDef, x: number, z: number): boolean {
    if (Math.hypot(x, z) > 32) return false
    for (const p of this.placed) {
      const other = BUILDING_BY_ID.get(p.defId)!
      if (Math.hypot(p.x - x, p.z - z) < def.footprint + other.footprint) return false
    }
    return true
  }

  place(def: BuildingDef, x: number, z: number, rot: number): Placed | null {
    if (!this.canPlace(def, x, z)) return null
    const group = def.build(this.matBuilding)
    group.position.set(x, 0, z)
    group.rotation.y = rot
    this.scene.add(group)
    const p: Placed = { id: this.nextId++, defId: def.id, x, z, rot, group }
    this.placed.push(p)
    this.refreshAuras()
    return p
  }

  remove(p: Placed) {
    const i = this.placed.indexOf(p)
    if (i < 0) return
    this.placed.splice(i, 1)
    this.scene.remove(p.group)
    disposeGroup(p.group)
    this.refreshAuras()
  }

  nearest(x: number, z: number, maxDist: number): Placed | null {
    let best: Placed | null = null
    let bd = maxDist
    for (const p of this.placed) {
      const d = Math.hypot(p.x - x, p.z - z)
      if (d < bd) { bd = d; best = p }
    }
    return best
  }

  refreshAuras() {
    let n = 0
    for (const p of this.placed) {
      if (n >= MAX_AURAS) break
      const def = BUILDING_BY_ID.get(p.defId)!
      this.auraData[n * 4 + 0] = p.x
      this.auraData[n * 4 + 1] = -p.z          // plane is rotated; z maps to -y
      this.auraData[n * 4 + 2] = def.auraRadius
      this.auraData[n * 4 + 3] = def.auraStrength
      n++
    }
    this.groundMat.uniforms.uAuraCount.value = n
    this.groundMat.uniformsNeedUpdate = true
  }

  setAurasVisible(v: boolean) {
    this.groundMat.uniforms.uShowAuras.value = v ? 1 : 0
  }

  /**
   * Income model, deliberately crude - Phase 0 has no gameplay. It exists so the
   * placement UI can show a live delta and prove that moving a building by a
   * fraction of a unit visibly changes the number.
   */
  income(): number {
    let total = 0
    for (const p of this.placed) {
      const def = BUILDING_BY_ID.get(p.defId)!
      if (def.base <= 0) continue
      let mult = 1
      for (const q of this.placed) {
        if (q === p) continue
        const qd = BUILDING_BY_ID.get(q.defId)!
        const dist = Math.hypot(p.x - q.x, p.z - q.z)
        if (dist > qd.auraRadius) continue
        const f = 1 - dist / qd.auraRadius
        switch (qd.auraKind) {
          case 'GLAMOUR': mult += 0.45 * f * qd.auraStrength; break
          case 'TRAFFIC': mult += 0.30 * f * qd.auraStrength; break
          case 'LUCK':    mult += 0.22 * f * qd.auraStrength; break
          case 'POWER':   mult += 0.18 * f * qd.auraStrength; break
          case 'SECURITY': mult -= 0.16 * f * qd.auraStrength; break
          case 'NOISE':   mult -= 0.24 * f * qd.auraStrength; break
        }
      }
      total += def.base * Math.max(0.1, mult)
    }
    return total
  }

  /**
   * Income if def were placed at (x,z) - drives the live placement readout.
   * Runs every frame while a ghost is up, so it allocates nothing.
   */
  incomeWith(def: BuildingDef, x: number, z: number): number {
    const fake: Placed = { id: -1, defId: def.id, x, z, rot: 0, group: EMPTY_GROUP }
    this.placed.push(fake)
    const v = this.income()
    this.placed.pop()
    return v
  }

  serialize() {
    return this.placed.map((p) => ({ defId: p.defId, x: p.x, z: p.z, rot: p.rot }))
  }

  load(data: { defId: string; x: number; z: number; rot: number }[]) {
    for (const p of [...this.placed]) this.remove(p)
    for (const d of data) {
      const def = BUILDING_BY_ID.get(d.defId)
      if (def) this.place(def, d.x, d.z, d.rot)
    }
  }
}

export function disposeGroup(grp: THREE.Object3D) {
  grp.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
  })
}

export { BUILDINGS }
