import * as THREE from 'three'
import { UNIT_BY_ID, type UnitDef } from '../game/units'
import type { Unit } from '../game/state'

const MAX_AURAS = 48

/**
 * The 3D district. Purely presentational: the Game owns placement and
 * simulation, and the world mirrors it. Buildings sit at float coordinates with
 * float aura radii; the character grid is only the display resolution, so
 * placement precision is bounded by zoom and raycast rather than by cells
 * (features.md section 2.2).
 */
export class World {
  scene = new THREE.Scene()
  camera: THREE.OrthographicCamera
  ghost: THREE.Group | null = null
  ghostValid = true

  target = new THREE.Vector3(0, 0, 0)
  azimuth = Math.PI * 0.25
  pitch = 0.85
  /** Half-width of the view in world units. */
  zoom = 12

  private matBuilding: THREE.MeshLambertMaterial
  private matSelected: THREE.MeshLambertMaterial
  private matGhost: THREE.MeshLambertMaterial
  private matGhostBad: THREE.MeshLambertMaterial
  private groundMat: THREE.ShaderMaterial
  private auraData = new Float32Array(MAX_AURAS * 4)
  private meshes = new Map<number, THREE.Group>()

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
    this.matSelected = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 })
    this.matGhost = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    this.matGhostBad = new THREE.MeshLambertMaterial({ color: 0x552222, transparent: true, opacity: 0.5 })

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
              float f = 1.0 - smoothstep(0.0, a.z, length(vPos - a.xy));
              d += f * f * f * a.w;
            }
          }
          d = d / (1.0 + d);
          float plot = 1.0 - smoothstep(uPlotRadius - 1.2, uPlotRadius, length(vPos));
          gl_FragColor = vec4(vec3(0.015 + 0.115 * d) * plot, 1.0);
        }
      `,
    })

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), this.groundMat)
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)
    this.updateCamera()
  }

  /** Mirrors the game's unit list into the scene, creating and removing meshes. */
  sync(units: Unit[], selectedId: number | null, auraRange: number) {
    const seen = new Set<number>()
    for (const u of units) {
      seen.add(u.id)
      let mesh = this.meshes.get(u.id)
      if (!mesh) {
        mesh = UNIT_BY_ID.get(u.defId)!.build(this.matBuilding)
        mesh.userData.defId = u.defId
        this.scene.add(mesh)
        this.meshes.set(u.id, mesh)
      }
      mesh.position.set(u.x, 0, u.z)
      mesh.rotation.y = u.rot
      const mat = u.id === selectedId ? this.matSelected : this.matBuilding
      mesh.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat })
    }
    for (const [id, mesh] of [...this.meshes]) {
      if (seen.has(id)) continue
      this.scene.remove(mesh)
      disposeGroup(mesh)
      this.meshes.delete(id)
    }
    this.refreshAuras(units, auraRange)
  }

  private refreshAuras(units: Unit[], range: number) {
    let n = 0
    for (const u of units) {
      if (n >= MAX_AURAS) break
      const def = UNIT_BY_ID.get(u.defId)!
      const a = def.auras[0]
      if (!a) continue
      this.auraData[n * 4 + 0] = u.x
      this.auraData[n * 4 + 1] = -u.z       // ground plane is rotated; z maps to -y
      this.auraData[n * 4 + 2] = a.radius * range
      this.auraData[n * 4 + 3] = a.strength
      n++
    }
    this.groundMat.uniforms.uAuraCount.value = n
    this.groundMat.uniformsNeedUpdate = true
  }

  setAurasVisible(v: boolean) {
    this.groundMat.uniforms.uShowAuras.value = v ? 1 : 0
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
   * top and bottom. An asymmetric frustum frames the district inside the visible
   * band instead of the canvas centre.
   */
  setViewport(canvasAspect: number, rows: number, topRows: number, bottomRows: number) {
    const halfW = this.zoom
    const halfH = halfW / canvasAspect
    const dy = -halfH * ((bottomRows - topRows) / rows)
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH + dy
    this.camera.bottom = -halfH + dy
    this.camera.near = 0.1
    this.camera.far = 400
    this.camera.updateProjectionMatrix()
  }

  pickGround(ndc: THREE.Vector2): THREE.Vector3 | null {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    return ray.ray.intersectPlane(plane, hit) ? hit : null
  }

  showGhost(def: UnitDef, x: number, z: number, rot: number, valid: boolean) {
    if (!this.ghost || this.ghost.userData.defId !== def.id) {
      this.clearGhost()
      this.ghost = def.build(this.matGhost)
      this.ghost.userData.defId = def.id
      this.scene.add(this.ghost)
    }
    this.ghostValid = valid
    const mat = valid ? this.matGhost : this.matGhostBad
    this.ghost.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat })
    this.ghost.position.set(x, 0, z)
    this.ghost.rotation.y = rot
  }

  clearGhost() {
    if (!this.ghost) return
    this.scene.remove(this.ghost)
    disposeGroup(this.ghost)
    this.ghost = null
  }
}

export function disposeGroup(grp: THREE.Object3D) {
  grp.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
  })
}
