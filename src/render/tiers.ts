/**
 * Terminal tiers (features.md section 2.4). Everything the uplink progression
 * track buys is a parameter of the renderer, so "upgrading your terminal" and
 * "improving the picture" are literally the same thing.
 */
export interface Tier {
  id: number
  name: string
  baud: string
  cols: number
  rows: number
  /** Number of phosphor shades the world is quantized to. */
  shades: number
  /** Supersampling factor for the scene pass, per character cell. */
  ss: number
  /** Directional Sobel edge glyphs on/off. */
  edges: boolean
  /** Normal-buffer driven glyph set selection on/off. */
  normals: boolean
  /** Free camera orbit (vs 4 fixed steps). */
  freeOrbit: boolean
  /** CRT post effects. */
  crt: boolean
}

export const TIERS: Tier[] = [
  // Verified in Phase 0: edges carry *form*, shades carry *depth*. Turning
  // edges off at tier 0 made buildings unidentifiable, not merely crude, so
  // tier 0 keeps edges and earns its primitiveness through shades and grid size.
  { id: 0, name: 'TELETYPE',  baud: '300',    cols: 40,  rows: 24, shades: 2,  ss: 2, edges: true,  normals: false, freeOrbit: false, crt: false },
  { id: 1, name: 'DIALUP',    baud: '1200',   cols: 48,  rows: 30, shades: 4,  ss: 2, edges: true,  normals: false, freeOrbit: false, crt: false },
  { id: 2, name: 'LEASED',    baud: '9600',   cols: 64,  rows: 36, shades: 8,  ss: 3, edges: true,  normals: true,  freeOrbit: false, crt: false },
  { id: 3, name: 'FIBRE',     baud: '57.6k',  cols: 80,  rows: 45, shades: 16, ss: 3, edges: true,  normals: true,  freeOrbit: true,  crt: false },
  { id: 4, name: 'DARKLINE',  baud: '1M',     cols: 100, rows: 56, shades: 32, ss: 3, edges: true,  normals: true,  freeOrbit: true,  crt: false },
  { id: 5, name: 'NEURAL',    baud: 'direct', cols: 120, rows: 68, shades: 64, ss: 4, edges: true,  normals: true,  freeOrbit: true,  crt: true  },
]

/** Phosphor palettes. Index 0 is the default amber. */
export const PHOSPHORS: { name: string; rgb: [number, number, number] }[] = [
  { name: 'AMBER', rgb: [1.0, 0.68, 0.18] },
  { name: 'GREEN', rgb: [0.42, 1.0, 0.45] },
  { name: 'ICE',   rgb: [0.55, 0.82, 1.0] },
  { name: 'MAGMA', rgb: [1.0, 0.42, 0.62] },
]

/** UI accent colors, indexed by the cell buffer's color byte. */
export const UI_COLORS: [number, number, number][] = [
  [0.58, 0.40, 0.11], // 0 dim phosphor
  [1.00, 0.72, 0.22], // 1 phosphor
  [1.00, 0.94, 0.80], // 2 bright / white
  [1.00, 0.32, 0.26], // 3 alert red
  [0.42, 1.00, 0.45], // 4 ok green
  [0.55, 0.82, 1.00], // 5 info cyan
  [0.86, 0.45, 1.00], // 6 rare magenta
  [0.30, 0.20, 0.06], // 7 shadow
]
