import * as THREE from 'three'
import { CHARS, FALLBACK } from './charset'

export interface GlyphAtlas {
  texture: THREE.CanvasTexture
  /** Atlas dimensions in glyphs. */
  cols: number
  rows: number
  /** Glyph cell size in atlas pixels. */
  cellW: number
  cellH: number
  /** Characters the font could not render, after fallback substitution. */
  missing: string[]
}

const ATLAS_COLS = 16
const CELL_W = 16
const CELL_H = 32

const FONT_STACK =
  '"DejaVu Sans Mono", "Menlo", "Consolas", "Liberation Mono", monospace'

/**
 * Rasterizes the charset into a single texture once at startup. The ASCII pass
 * then indexes into it per cell, so glyph drawing costs nothing per frame.
 *
 * Any character the font renders as blank is swapped for an ASCII fallback,
 * which keeps the output legible on a device whose monospace font lacks
 * box-drawing coverage.
 */
export function buildGlyphAtlas(): GlyphAtlas {
  const rows = Math.ceil(CHARS.length / ATLAS_COLS)
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_COLS * CELL_W
  canvas.height = rows * CELL_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const probe = document.createElement('canvas')
  probe.width = CELL_W
  probe.height = CELL_H
  const pctx = probe.getContext('2d', { willReadFrequently: true })!

  const missing: string[] = []

  for (let i = 0; i < CHARS.length; i++) {
    let ch = CHARS[i]
    if (ch !== ' ' && !rendersNonBlank(pctx, ch)) {
      const alt = FALLBACK[ch]
      missing.push(ch)
      ch = alt && rendersNonBlank(pctx, alt) ? alt : '?'
    }
    const cx = (i % ATLAS_COLS) * CELL_W + CELL_W / 2
    const cy = Math.floor(i / ATLAS_COLS) * CELL_H + CELL_H / 2
    ctx.font = `${Math.round(CELL_H * 0.82)}px ${FONT_STACK}`
    ctx.fillText(ch, cx, cy)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  // Atlas rows are authored top-down; keep texture v top-down to match.
  texture.flipY = false
  texture.colorSpace = THREE.NoColorSpace

  return { texture, cols: ATLAS_COLS, rows, cellW: CELL_W, cellH: CELL_H, missing }
}

function rendersNonBlank(ctx: CanvasRenderingContext2D, ch: string): boolean {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CELL_W, CELL_H)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.round(CELL_H * 0.82)}px ${FONT_STACK}`
  ctx.fillText(ch, CELL_W / 2, CELL_H / 2)
  const data = ctx.getImageData(0, 0, CELL_W, CELL_H).data
  for (let i = 0; i < data.length; i += 4) if (data[i] > 24) return true
  return false
}
