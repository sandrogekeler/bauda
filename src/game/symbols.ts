/**
 * Symbols are the retention engine (features.md section 7.2). A symbol pays out
 * on its own AND reacts to its neighbours inside the machine, so the same set of
 * symbols scores differently depending on arrangement. The player authors the
 * build; the spin only reveals it.
 */

export type Tag = 'FRUIT' | 'ANIMAL' | 'GEM' | 'MACHINE' | 'PERSON' | 'CHAOS' | 'CASH'

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC'

export interface SymbolDef {
  id: string
  glyph: string
  name: string
  base: number
  tags: Tag[]
  rarity: Rarity
  /** One-line description, shown in the codex and the install UI. */
  note: string
  effect?: Effect
}

export type Effect =
  /** Add a flat amount to every orthogonally adjacent symbol. */
  | { kind: 'ADD_ADJ'; amount: number; tag?: Tag }
  /** Multiply every adjacent symbol's value. */
  | { kind: 'MULT_ADJ'; factor: number; tag?: Tag }
  /** Gain a flat amount per adjacent symbol carrying a tag. */
  | { kind: 'ADD_PER_ADJ'; amount: number; tag: Tag }
  /** Multiply own value per adjacent symbol carrying a tag. */
  | { kind: 'MULT_PER_ADJ'; factor: number; tag: Tag }
  /** Multiply everything in the same row. */
  | { kind: 'MULT_ROW'; factor: number }
  /** Multiply the machine's whole payout. */
  | { kind: 'MULT_ALL'; factor: number }
  /** With probability p, multiply own value. The only true gamble at symbol level. */
  | { kind: 'CHANCE'; p: number; factor: number }
  /** Permanently gains value every spin. Rewards leaving a build alone. */
  | { kind: 'GROW'; amount: number }
  /** Consumes an adjacent symbol with a tag for a large one-off payout. */
  | { kind: 'DEVOUR'; tag: Tag; gain: number }

export const SYMBOLS: SymbolDef[] = [
  // --- commons: the vocabulary -------------------------------------------
  { id: 'cherry', glyph: 'c', name: 'CHERRY', base: 2, tags: ['FRUIT'], rarity: 'COMMON', note: 'Pays 2.' },
  { id: 'lemon', glyph: 'l', name: 'LEMON', base: 3, tags: ['FRUIT'], rarity: 'COMMON', note: 'Pays 3.' },
  { id: 'plum', glyph: 'p', name: 'PLUM', base: 4, tags: ['FRUIT'], rarity: 'COMMON', note: 'Pays 4.' },
  { id: 'coin', glyph: 'o', name: 'COIN', base: 5, tags: ['CASH'], rarity: 'COMMON', note: 'Pays 5.' },
  { id: 'bell', glyph: 'B', name: 'BELL', base: 6, tags: ['MACHINE'], rarity: 'COMMON', note: 'Pays 6.' },
  { id: 'cog', glyph: '*', name: 'COG', base: 3, tags: ['MACHINE'], rarity: 'COMMON', note: 'Pays 3. +2 to adjacent MACHINE.', effect: { kind: 'ADD_ADJ', amount: 2, tag: 'MACHINE' } },
  { id: 'rat', glyph: 'r', name: 'RAT', base: 1, tags: ['ANIMAL'], rarity: 'COMMON', note: 'Pays 1. +2 per adjacent FRUIT.', effect: { kind: 'ADD_PER_ADJ', amount: 2, tag: 'FRUIT' } },
  { id: 'clover', glyph: '%', name: 'CLOVER', base: 2, tags: ['CHAOS'], rarity: 'COMMON', note: 'Pays 2. 25% chance to pay x8.', effect: { kind: 'CHANCE', p: 0.25, factor: 8 } },

  // --- uncommons: first real synergies ------------------------------------
  { id: 'orchard', glyph: 'T', name: 'ORCHARD', base: 4, tags: ['FRUIT'], rarity: 'UNCOMMON', note: 'Pays 4. +3 to adjacent FRUIT.', effect: { kind: 'ADD_ADJ', amount: 3, tag: 'FRUIT' } },
  { id: 'cat', glyph: 'f', name: 'CAT', base: 4, tags: ['ANIMAL'], rarity: 'UNCOMMON', note: 'Pays 4. x1.5 per adjacent ANIMAL.', effect: { kind: 'MULT_PER_ADJ', factor: 1.5, tag: 'ANIMAL' } },
  { id: 'dealer', glyph: 'D', name: 'DEALER', base: 6, tags: ['PERSON'], rarity: 'UNCOMMON', note: 'Pays 6. x1.4 to adjacent.', effect: { kind: 'MULT_ADJ', factor: 1.4 } },
  { id: 'ingot', glyph: '=', name: 'INGOT', base: 9, tags: ['CASH', 'GEM'], rarity: 'UNCOMMON', note: 'Pays 9.' },
  { id: 'spring', glyph: 'S', name: 'SPRING', base: 3, tags: ['MACHINE'], rarity: 'UNCOMMON', note: 'Pays 3, and permanently gains 0.4 each spin.', effect: { kind: 'GROW', amount: 0.4 } },
  { id: 'magpie', glyph: 'm', name: 'MAGPIE', base: 3, tags: ['ANIMAL'], rarity: 'UNCOMMON', note: 'Pays 3. +6 per adjacent GEM.', effect: { kind: 'ADD_PER_ADJ', amount: 6, tag: 'GEM' } },
  { id: 'wire', glyph: '+', name: 'WIRE', base: 1, tags: ['MACHINE'], rarity: 'UNCOMMON', note: 'Pays 1. x1.35 to its whole row.', effect: { kind: 'MULT_ROW', factor: 1.35 } },
  { id: 'dice', glyph: 'd', name: 'DICE', base: 4, tags: ['CHAOS'], rarity: 'UNCOMMON', note: 'Pays 4. 40% chance to pay x4.', effect: { kind: 'CHANCE', p: 0.4, factor: 4 } },

  // --- rares: build-defining ----------------------------------------------
  { id: 'ruby', glyph: 'R', name: 'RUBY', base: 18, tags: ['GEM'], rarity: 'RARE', note: 'Pays 18.' },
  { id: 'vault', glyph: '#', name: 'VAULT', base: 12, tags: ['CASH', 'MACHINE'], rarity: 'RARE', note: 'Pays 12. +5 to adjacent CASH.', effect: { kind: 'ADD_ADJ', amount: 5, tag: 'CASH' } },
  { id: 'crowd', glyph: 'C', name: 'CROWD', base: 5, tags: ['PERSON'], rarity: 'RARE', note: 'Pays 5. +4 per adjacent PERSON.', effect: { kind: 'ADD_PER_ADJ', amount: 4, tag: 'PERSON' } },
  { id: 'fox', glyph: 'F', name: 'FOX', base: 2, tags: ['ANIMAL'], rarity: 'RARE', note: 'Pays 2. Devours an adjacent ANIMAL for +45.', effect: { kind: 'DEVOUR', tag: 'ANIMAL', gain: 45 } },
  { id: 'jackpot', glyph: 'J', name: 'JACKPOT', base: 2, tags: ['CHAOS', 'CASH'], rarity: 'RARE', note: 'Pays 2. 8% chance to pay x40.', effect: { kind: 'CHANCE', p: 0.08, factor: 40 } },
  { id: 'boss', glyph: 'K', name: 'THE BOSS', base: 10, tags: ['PERSON'], rarity: 'RARE', note: 'Pays 10. x1.25 to the whole machine.', effect: { kind: 'MULT_ALL', factor: 1.25 } },
  { id: 'furnace', glyph: 'H', name: 'FURNACE', base: 8, tags: ['MACHINE'], rarity: 'RARE', note: 'Pays 8. x1.8 to adjacent MACHINE.', effect: { kind: 'MULT_ADJ', factor: 1.8, tag: 'MACHINE' } },
  { id: 'seed', glyph: 's', name: 'SEED', base: 1, tags: ['FRUIT'], rarity: 'RARE', note: 'Pays 1, and permanently gains 1.2 each spin.', effect: { kind: 'GROW', amount: 1.2 } },

  // --- epics: the payoff of a long run ------------------------------------
  { id: 'diamond', glyph: 'W', name: 'DIAMOND', base: 44, tags: ['GEM'], rarity: 'EPIC', note: 'Pays 44.' },
  { id: 'syndicate', glyph: 'Y', name: 'SYNDICATE', base: 14, tags: ['PERSON', 'CASH'], rarity: 'EPIC', note: 'Pays 14. x1.6 to the whole machine.', effect: { kind: 'MULT_ALL', factor: 1.6 } },
  { id: 'comet', glyph: 'A', name: 'COMET', base: 6, tags: ['CHAOS'], rarity: 'EPIC', note: 'Pays 6. x2.6 to its whole row.', effect: { kind: 'MULT_ROW', factor: 2.6 } },
  { id: 'reactor', glyph: 'X', name: 'REACTOR', base: 16, tags: ['MACHINE'], rarity: 'EPIC', note: 'Pays 16. x2.2 to adjacent.', effect: { kind: 'MULT_ADJ', factor: 2.2 } },
  { id: 'hoard', glyph: 'G', name: 'HOARD', base: 5, tags: ['GEM', 'CASH'], rarity: 'EPIC', note: 'Pays 5. x2.0 per adjacent GEM.', effect: { kind: 'MULT_PER_ADJ', factor: 2.0, tag: 'GEM' } },
  { id: 'wildfire', glyph: 'V', name: 'WILDFIRE', base: 3, tags: ['CHAOS'], rarity: 'EPIC', note: 'Pays 3. 20% chance to pay x25.', effect: { kind: 'CHANCE', p: 0.2, factor: 25 } },
]

export const SYMBOL_BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]))

export const RARITY_WEIGHT: Record<Rarity, number> = {
  COMMON: 100,
  UNCOMMON: 42,
  RARE: 13,
  EPIC: 3,
}

export const RARITY_COLOR: Record<Rarity, number> = {
  COMMON: 1,
  UNCOMMON: 4,
  RARE: 5,
  EPIC: 6,
}
