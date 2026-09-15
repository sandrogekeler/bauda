import * as THREE from 'three'
import { buildGlyphAtlas, type GlyphAtlas } from './glyphAtlas'
import { CELL_FS, DISPLAY_FS, DOG_FS, QUAD_VS } from './shaders'
import { EDGE, RAMP, glyphIndex, CHARS } from './charset'
import { PHOSPHORS, UI_COLORS, type Tier } from './tiers'
import type { CellBuffer } from '../ui/cellBuffer'

const MAX_ROWS = 144

/**
 * Owns the whole 3D -> ASCII pipeline. The scene renders to a thumbnail-sized
 * target; everything expensive happens at character-cell resolution.
 */
export class AsciiRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly atlas: GlyphAtlas

  cols = 64
  rows = 36

  private sceneRT!: THREE.WebGLRenderTarget
  private normalRT!: THREE.WebGLRenderTarget
  private dogRT!: THREE.WebGLRenderTarget
  private cellRT!: THREE.WebGLRenderTarget

  private quad: THREE.BufferGeometry
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private dogMat: THREE.ShaderMaterial
  private cellMat: THREE.ShaderMaterial
  private displayMat: THREE.ShaderMaterial
  private passScene = new THREE.Scene()
  private passMesh: THREE.Mesh

  private overlayTex!: THREE.DataTexture
  private normalMat = new THREE.MeshNormalMaterial()

  private tier!: Tier
  private phosphor = 0
  contextLost = false

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 1)

    this.atlas = buildGlyphAtlas()

    this.quad = new THREE.PlaneGeometry(2, 2)

    this.dogMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VS,
      fragmentShader: DOG_FS,
      uniforms: { tScene: { value: null }, uTexel: { value: new THREE.Vector2() } },
    })

    this.cellMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VS,
      fragmentShader: CELL_FS,
      uniforms: {
        tScene: { value: null },
        tDog: { value: null },
        tNormal: { value: null },
        tDepth: { value: null },
        tOverlay: { value: null },
        uGrid: { value: new THREE.Vector2(64, 36) },
        uSS: { value: 3 },
        uShades: { value: 8 },
        uEdges: { value: 1 },
        uNormals: { value: 1 },
        uEdgeThreshold: { value: 0.085 },
        uRamp: { value: RAMP.map(glyphIndex) },
        uEdgeGlyph: { value: EDGE.map(glyphIndex) },
      },
    })

    this.displayMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VS,
      fragmentShader: DISPLAY_FS,
      uniforms: {
        tCell: { value: null },
        tGlyph: { value: this.atlas.texture },
        uGrid: { value: new THREE.Vector2(64, 36) },
        uAtlasGrid: { value: new THREE.Vector2(this.atlas.cols, this.atlas.rows) },
        uPhosphor: { value: new THREE.Vector3(...PHOSPHORS[0].rgb) },
        uUiColors: { value: UI_COLORS.map((c) => new THREE.Vector3(...c)) },
        uShades: { value: 8 },
        uCrt: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
    })

    this.passMesh = new THREE.Mesh(this.quad, this.dogMat)
    this.passScene.add(this.passMesh)

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.contextLost = true
    })
    canvas.addEventListener('webglcontextrestored', () => {
      // iOS discards GL contexts on backgrounding; rebuild everything derived.
      this.contextLost = false
      this.atlas.texture.needsUpdate = true
      this.allocate()
    })
  }

  setTier(tier: Tier) {
    this.tier = tier
    this.allocate()
  }

  setPhosphor(i: number) {
    this.phosphor = i % PHOSPHORS.length
    this.displayMat.uniforms.uPhosphor.value.set(...PHOSPHORS[this.phosphor].rgb)
  }

  /** Canvas size changed, or tier changed: recompute the grid and reallocate. */
  allocate() {
    const canvas = this.renderer.domElement
    const w = canvas.clientWidth || 800
    const h = canvas.clientHeight || 600
    this.renderer.setSize(w, h, false)

    // Character cells are 1:2 (w:h). Derive rows from the canvas aspect so
    // glyphs are never stretched; a tall phone screen simply gets more rows.
    this.cols = this.tier.cols
    this.rows = Math.max(12, Math.min(MAX_ROWS, Math.round((0.5 * this.cols * h) / w)))

    const ss = this.tier.ss
    const sw = this.cols * ss
    const sh = this.rows * ss

    this.sceneRT?.dispose()
    this.normalRT?.dispose()
    this.dogRT?.dispose()
    this.cellRT?.dispose()

    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    }
    this.sceneRT = new THREE.WebGLRenderTarget(sw, sh, rtOpts)
    // Depth drives silhouette detection; with an orthographic camera it is linear.
    this.sceneRT.depthTexture = new THREE.DepthTexture(sw, sh)
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType
    this.normalRT = new THREE.WebGLRenderTarget(sw, sh, rtOpts)
    this.dogRT = new THREE.WebGLRenderTarget(sw, sh, rtOpts)
    this.cellRT = new THREE.WebGLRenderTarget(this.cols, this.rows, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })

    const data = new Uint8Array(this.cols * this.rows * 4)
    this.overlayTex?.dispose()
    this.overlayTex = new THREE.DataTexture(data, this.cols, this.rows)
    this.overlayTex.minFilter = THREE.NearestFilter
    this.overlayTex.magFilter = THREE.NearestFilter
    this.overlayTex.needsUpdate = true

    const t = this.tier
    this.dogMat.uniforms.uTexel.value.set(1 / sw, 1 / sh)
    this.cellMat.uniforms.uGrid.value.set(this.cols, this.rows)
    this.cellMat.uniforms.uSS.value = ss
    this.cellMat.uniforms.uShades.value = t.shades
    this.cellMat.uniforms.uEdges.value = t.edges ? 1 : 0
    this.cellMat.uniforms.uNormals.value = t.normals ? 1 : 0
    this.displayMat.uniforms.uGrid.value.set(this.cols, this.rows)
    this.displayMat.uniforms.uShades.value = t.shades
    this.displayMat.uniforms.uCrt.value = t.crt ? 1 : 0
    this.displayMat.uniforms.uResolution.value.set(w, h)
  }

  /** Uploads the terminal chrome layer for this frame. */
  setOverlay(buf: CellBuffer) {
    if (!buf.dirty) return
    if (buf.cols !== this.cols || buf.rows !== this.rows) return
    ;(this.overlayTex.image.data as Uint8Array).set(buf.data)
    this.overlayTex.needsUpdate = true
    buf.dirty = false
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.contextLost) return
    const r = this.renderer

    // 1. scene -> supersampled colour target
    r.setRenderTarget(this.sceneRT)
    r.clear()
    r.render(scene, camera)

    // 2. scene normals (drives roof/wall glyph separation)
    if (this.tier.normals) {
      const prev = scene.overrideMaterial
      scene.overrideMaterial = this.normalMat
      r.setRenderTarget(this.normalRT)
      r.clear()
      r.render(scene, camera)
      scene.overrideMaterial = prev
    }

    // 3. difference of gaussians
    this.passMesh.material = this.dogMat
    this.dogMat.uniforms.tScene.value = this.sceneRT.texture
    r.setRenderTarget(this.dogRT)
    r.render(this.passScene, this.quadCam)

    // 4. per-cell decision: this output is the character grid
    this.passMesh.material = this.cellMat
    this.cellMat.uniforms.tScene.value = this.sceneRT.texture
    this.cellMat.uniforms.tDog.value = this.dogRT.texture
    this.cellMat.uniforms.tNormal.value = this.normalRT.texture
    this.cellMat.uniforms.tDepth.value = this.sceneRT.depthTexture
    this.cellMat.uniforms.tOverlay.value = this.overlayTex
    r.setRenderTarget(this.cellRT)
    r.render(this.passScene, this.quadCam)

    // 5. display: glyph atlas lookup per screen pixel
    this.passMesh.material = this.displayMat
    this.displayMat.uniforms.tCell.value = this.cellRT.texture
    r.setRenderTarget(null)
    r.render(this.passScene, this.quadCam)
  }

  /**
   * Reads the cell buffer back as text. Slow (a GPU stall), debug only - but it
   * makes the render pipeline's actual output inspectable and diffable, which
   * is how we answer "is this legible?" without eyeballing a screenshot.
   */
  dumpText(): string {
    const buf = new Uint8Array(this.cols * this.rows * 4)
    this.renderer.readRenderTargetPixels(this.cellRT, 0, 0, this.cols, this.rows, buf)
    const lines: string[] = []
    for (let y = this.rows - 1; y >= 0; y--) {
      let line = ''
      for (let x = 0; x < this.cols; x++) {
        const i = (y * this.cols + x) * 4
        line += CHARS[buf[i]] ?? ' '
      }
      lines.push(line.replace(/\s+$/, ''))
    }
    return lines.join('\n')
  }
}
