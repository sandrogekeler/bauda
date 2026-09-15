import { glyphIndex } from '../render/charset'

/**
 * The terminal chrome layer. UI is written here as characters and uploaded as a
 * texture, then composited by the ASCII pass into the same cell grid as the
 * world - so the final frame is one unified character image rather than a 3D
 * canvas with HTML on top (features.md section 2.1).
 *
 * Layout per cell in the RGBA byte buffer:
 *   r = glyph index, g = UI color index, b = flags (1 = inverse), a = 255 when set
 */
export class CellBuffer {
  cols = 0
  rows = 0
  data = new Uint8Array(0)
  dirty = true

  resize(cols: number, rows: number) {
    if (cols === this.cols && rows === this.rows) return
    this.cols = cols
    this.rows = rows
    this.data = new Uint8Array(cols * rows * 4)
    this.dirty = true
  }

  clear() {
    this.data.fill(0)
    this.dirty = true
  }

  set(x: number, y: number, ch: string, color = 1, inverse = false) {
    const cx = Math.round(x)
    const cy = Math.round(y)
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return
    const i = (cy * this.cols + cx) * 4
    this.data[i] = glyphIndex(ch)
    this.data[i + 1] = color
    this.data[i + 2] = inverse ? 1 : 0
    this.data[i + 3] = 255
    this.dirty = true
  }

  /** Marks a cell as transparent, letting the world show through. */
  punch(x: number, y: number) {
    const cx = Math.round(x)
    const cy = Math.round(y)
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return
    this.data[(cy * this.cols + cx) * 4 + 3] = 0
    this.dirty = true
  }

  text(x: number, y: number, s: string, color = 1, inverse = false) {
    for (let i = 0; i < s.length; i++) this.set(x + i, y, s[i], color, inverse)
  }

  /** Right-aligned text ending at x (inclusive). */
  textRight(x: number, y: number, s: string, color = 1) {
    this.text(x - s.length + 1, y, s, color)
  }

  fill(x: number, y: number, w: number, h: number, ch: string, color = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch, color)
  }

  /** Clears a rectangle to transparent so the 3D world is visible there. */
  punchRect(x: number, y: number, w: number, h: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.punch(x + i, y + j)
  }

  box(x: number, y: number, w: number, h: number, color = 1, title?: string) {
    const [tl, tr, bl, br, hz, vt] = ['┌', '┐', '└', '┘', '─', '│']
    this.set(x, y, tl, color)
    this.set(x + w - 1, y, tr, color)
    this.set(x, y + h - 1, bl, color)
    this.set(x + w - 1, y + h - 1, br, color)
    for (let i = 1; i < w - 1; i++) {
      this.set(x + i, y, hz, color)
      this.set(x + i, y + h - 1, hz, color)
    }
    for (let j = 1; j < h - 1; j++) {
      this.set(x, y + j, vt, color)
      this.set(x + w - 1, y + j, vt, color)
    }
    if (title) this.text(x + 2, y, ` ${title} `, color)
  }

  /** Horizontal meter, e.g. ══════▸···· */
  meter(x: number, y: number, w: number, frac: number, color = 1) {
    const filled = Math.max(0, Math.min(w, Math.round(frac * w)))
    for (let i = 0; i < w; i++) this.set(x + i, y, i < filled ? '═' : '·', color)
  }
}
