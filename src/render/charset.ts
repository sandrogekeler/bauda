/**
 * The atlas charset. Index into this array is the glyph index used by the
 * shaders, so the order is part of the render contract - append, never reorder.
 *
 * Kept deliberately small: printable ASCII plus box drawing. No exotic Unicode
 * blocks, so font coverage risk stays low (see features.md section 2.7).
 */

const ASCII: string[] = []
for (let c = 32; c <= 126; c++) ASCII.push(String.fromCharCode(c))

/** Box drawing, diagonals and a few symbols used by the terminal chrome. */
const EXTRA = [
  '─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
  '═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
  '╱', '╲', '▸', '◂', '▪', '◆', '●', '░', '▒', '▓', '█',
  '▀', '▄', '▲', '▼', '·', '¢', '✦', '▣', '~', '×', '▴', '▾', '◆',
]

export const CHARS: string[] = [...ASCII, ...EXTRA]

const INDEX = new Map<string, number>()
CHARS.forEach((ch, i) => INDEX.set(ch, i))

/** Glyph index for a character; falls back to '?' for anything unmapped. */
export function glyphIndex(ch: string): number {
  return INDEX.get(ch) ?? INDEX.get('?')!
}

/**
 * Luminance ramp, dark to bright. The world's shading comes from this: the
 * ASCII pass maps a cell's brightness onto one of these glyphs.
 */
export const RAMP = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@']

/**
 * Directional edge glyphs, indexed by quantized Sobel gradient direction:
 * 0 = horizontal edge, 1 = diagonal /, 2 = vertical, 3 = diagonal \.
 * These are what make the output read as 3D geometry rather than a blur.
 */
export const EDGE = ['─', '╱', '│', '╲']

/** ASCII fallbacks used when the font lacks a box-drawing glyph. */
export const FALLBACK: Record<string, string> = {
  '─': '-', '│': '|', '┌': '+', '┐': '+', '└': '+', '┘': '+',
  '├': '+', '┤': '+', '┬': '+', '┴': '+', '┼': '+',
  '═': '=', '║': '|', '╔': '+', '╗': '+', '╚': '+', '╝': '+',
  '╠': '+', '╣': '+', '╦': '+', '╩': '+', '╬': '+',
  '╱': '/', '╲': '\\', '▸': '>', '◂': '<', '▪': '*', '◆': '*',
  '●': 'o', '░': '.', '▒': ':', '▓': '#', '█': '#',
  '▀': '^', '▄': '_', '▲': '^', '▼': 'v', '·': '.', '¢': 'c',
  '✦': '*', '▣': '#', '~': '~', '×': 'x', '▴': '^', '▾': 'v',
}
