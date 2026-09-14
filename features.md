# BAUDA — Features & Design Document

> A terminal-native idle empire builder with gambling mechanics.
> Runs as an iOS home-screen web app. Single player. No real money, no ads.

**Status:** design draft v0.1 — nothing implemented yet.

---

## 1. Vision & Pillars

You are a syndicate operator running gambling districts through a low-bandwidth
terminal uplink. You never see the world directly — you see it rendered as ASCII
on a control panel, at whatever fidelity your uplink can afford.

### The spine

Every system connects through one sentence:

> **Placement is the multiplier. Machines are the engine. Neighbours are the wager.**

- You **place** machines and support buildings freely in continuous space; overlapping
  auras multiply output.
- You **compose** machines from symbols/modules; they resolve as gambling pulls.
- You **wager** your bank against NPC cities; combat *is* a bet, resolved by machine
  loadout.

### Pillars

1. **The reveal is the reward.** Every payout is a build you authored resolving in
   front of you. Deterministic construction, random resolution.
2. **Space is the puzzle.** Non-grid placement with continuous proximity auras. A
   well-packed district is worth more than a big one.
3. **The terminal is diegetic.** UI capability is earned. Bandwidth, columns, colors,
   panes, and automation are all progression.
4. **Deep, not wide.** Few verbs, many combinations. Content comes from
   procedural affixes on authored archetypes, never from filler tiers.
5. **Respect the player.** No ads, no real money, no FOMO timers, no dark patterns.
   The gambling is a toy, not a funnel.

### Anti-overwhelm rules (binding constraints on all future design)

- At most **one new system unlocked per ~15 minutes** of early play. Never two at once.
- Any screen reachable in **≤ 2 taps**. Max **5** primary nav channels.
- A new player must produce their first payout within **20 seconds** of first launch.
- Any number > 1e6 uses one consistent, player-selectable notation.
- If a system cannot be explained in one terminal line, it is too complicated.

### Explicit non-goals

- No real-money gambling, no loot boxes, no purchasable currency of any kind.
- No multiplayer, no accounts, no server-authoritative state (offline-first).
- No real-time PvP. All "other players" are simulated NPCs.
- No infinite auto-generated *content*. Infinite *numbers* and *combinations* only.

---

## 2. Presentation: the ASCII control panel

### 2.1 The core trick — grid display, continuous world

ASCII is a character grid. The building system is not. These are reconciled by
treating the character grid as a **framebuffer**, not as the world:

- Buildings are stored at **float** world coordinates `(x, y)` with **float** aura radii.
- The renderer rasterizes the continuous world into a cell grid each frame.
- Sub-cell precision comes from **Braille glyphs** (`U+2800`–`U+28FF`, 2×4 dot
  subpixels per cell → 8× resolution) and **quadrant/half blocks** (`▘▝▗▖▀▄▌▐█`).
- **Wide glyphs** (Cogmind's approach): a large structure may claim 2×1 or 3×2 cells,
  breaking the visual monotony of one-glyph-one-thing.
- Zoom changes *world-units-per-cell*. Zooming in reveals sub-cell placement detail,
  so precise placement is visibly meaningful, not hidden by quantization.

Net effect: placement resolution is roughly **1/8 of a character cell**, which is
finer than any grid-snapped builder, while the screen still reads as a terminal.

### 2.2 Aura rendering

Overlapping proximity auras are rendered as **density shading** over the district:

```
 .  ·  :  ;  +  *  #  %  @      ← increasing aura density
```

Density = summed aura strength at that world point. This makes optimization
legible at a glance: you are literally looking at a heatmap of your own multipliers.
A "hot" district looks hot.

### 2.3 Panel layout

The app is framed as an OS — `BAUDA/OS` — not as a game menu system.

```
┌─ BAUDA/OS v0.1 ──────────────── 9600 baud ─ [HEAT 34%] ─┐
│ DISTRICT: NEON FLATS              BANK ▸ 4.812e9 ¢      │
├─────────────────────────────────────────────────────────┤
│        ⢀⣀⡀        ·:;+*#*+;:·                          │
│      ⢰⣿⣿⣿⡆      ·;+*#%@%#*+;·     [SLOT-A2]  ▸ 1.2e6/s │
│      ⠸⣿⣿⣿⠇    ·:;+*#%@@@%#*+;:·   [PINB-01]  ▸ 8.4e5/s │
│        ⠉⠉⠉      ·;+*#%@%#*+;·     [MEGA-S ]  ▸ CHARGING│
│                   ·:;+*#*+;:·      ══════════▸ 71%      │
├─────────────────────────────────────────────────────────┤
│ > _                                                     │
├─────────────────────────────────────────────────────────┤
│ [MAP] [MACH] [NET] [OPS] [SYS]                          │
└─────────────────────────────────────────────────────────┘
```

- **Top bar** — persistent state: baud rate, Heat, bank.
- **Viewport** — the rasterized district. Pan/pinch with touch.
- **Command line** — optional power-user input (see §9.3). Hidden until unlocked.
- **Log strip** — scrolling event lines (payouts, raids, alerts).
- **Channel bar** — the 5 primary nav channels.

### 2.4 Terminal progression (the uplink track)

Interface capability is a real upgrade path, purchased with Bandwidth:

| Tier | Baud | Columns | Colors | Unlocks |
|------|------|---------|--------|---------|
| 0 | 300 | 40 | 2 (amber/black) | Character-by-character text crawl. Manual refresh. |
| 1 | 1200 | 48 | 4 | Auto-refresh 1 Hz. Payout ticker. |
| 2 | 9600 | 64 | 8 | Live viewport. Aura heatmap overlay. |
| 3 | 57.6k | 80 | 16 | Split panes. Two districts visible at once. |
| 4 | 1M+ | 100+ | 256 | Animated glyph effects. Full-rate redraw. Ghost/preview placement. |
| 5 | "direct neural" | fluid | truecolor | CRT bloom, scanline, chroma effects. Cosmetic flex tier. |

This is deliberately a **quality-of-life-as-reward** track. Early friction is real
(you genuinely wait for text to crawl at 300 baud) but brief — tier 1 within minutes.
It makes the interface itself feel earned.

### 2.5 Visual identity

- Monospace-only. Self-hosted font with guaranteed Braille + box-drawing coverage
  (candidate: a permissively-licensed terminal font; verify glyph coverage before
  committing — iOS system monospace coverage of `U+2800` block is **unverified**
  and must be tested on device).
- Palette: phosphor amber default; green, ice-blue, and magenta unlockable.
- Optional CRT post-processing: scanlines, slight barrel, phosphor persistence.
  Must be toggleable — it will nauseate some players.
- Boot sequence on cold launch (skippable after first time, and skippable always
  via tap). Short. 2 seconds, not 15.

---

## 3. Core Loop & Session Shapes

### The 10-second loop
Watch a machine resolve → collect → the number goes up.

### The 60-second loop
Collect → buy/upgrade a machine → **place it** → see the aura heatmap change →
watch the new rate.

### The 10-minute loop
Fill the district → hit a wall → decide: raise Heat for more output, expand to a new
plot, or **Cashout** and rebuild better.

### The multi-hour loop
Cashout cycles → unlock a machine archetype → discover a synergy → chase a build.

### The multi-day loop
Buyout → new region, new affix pool, NPC neighbours with real teeth.

### The multi-week loop
Syndicate Ascension → new world tier → the rules of machines themselves change.

### Offline loop
Close app → return → **Night Shift Report** (see §8).

---

## 4. Economy

### Currencies

| Currency | Symbol | Scope | Earned by | Spent on |
|----------|--------|-------|-----------|----------|
| **Cash** | `¢` | Resets on Cashout | Machine payouts | Machines, buildings, plots |
| **Chips** | `◆` | Resets on Buyout | Cashout conversion | Permanent multipliers, aura range |
| **Deeds** | `▣` | Resets on Ascension | Buyout conversion | Machine archetypes, affix pool tiers |
| **Influence** | `✦` | Never resets | Ascension | World tier rules, NPC standing, terminal tiers |
| **Bandwidth** | `~` | Never resets | Milestones, NPC trade | Terminal/UI upgrades (§2.4) |
| **Heat** | `%` | Volatile meter | Big payouts, raids won | Not spent — *managed* (§5) |

Deliberately six, with strict role separation: three prestige layers, one soft
currency, one UI currency, one risk meter. No currency exists without a distinct
decision attached to it.

### Number scale

- Big-number math throughout (`break_infinity.js` or equivalent). Never native floats
  for balance-critical values.
- Notation options: Scientific (`1.42e18`), Engineering, Standard names
  (`1.42 Qi`), and Terminal (`1.42×10¹⁸`). Player choice, changeable anytime.

---

## 5. Heat — risk as a resource

A single volatile meter that unifies gambling, building, and combat.

**Heat rises from:** large payouts, Mega Slot detonations, Super Cashouts, winning
raids, high-variance machine settings.

**Heat falls from:** time, Security buildings, bribes (Cash), laying low
(voluntarily capping output).

**Heat effects:**

| Heat | Effect |
|------|--------|
| 0–25% | `COLD` — baseline. Payout ×1.0. No attention. |
| 26–50% | `WARM` — payout ×1.4. Occasional inspection events. |
| 51–75% | `HOT` — payout ×2.2. NPC raids become likely. Regulator audits. |
| 76–95% | `CRITICAL` — payout ×4.0. Frequent raids. Machines can be seized. |
| 96–100% | `MELTDOWN` — payout ×8.0 for 60s, then forced district shutdown + heavy loss. |

The strategic question every session: *how hot do I run?* Security buildings
suppress Heat but occupy space and dampen adjacent payout auras — so the answer is
also a **placement** question. That is the whole point: one meter, three systems.

---

## 6. Building & Placement

### 6.1 Free-form placement

- Continuous float coordinates. No grid, no snapping (optional soft-snap toggle for
  accessibility).
- Buildings have a **footprint** (collision radius/polygon) and an **aura radius**.
- Placement is legal if footprints do not overlap and the point is inside an owned plot.
- **Buildings can be moved and sold at any time.** (Deliberate divergence from
  *Islanders*, which forbids relocation — that works for a scoring puzzle, but an
  idle game where you cannot fix a mistake is hostile.) Moving costs a small fee
  and a brief downtime on that machine.

### 6.2 Proximity auras — the multiplier system

Every building projects one or more typed auras:

| Aura | Effect on buildings in range |
|------|------------------------------|
| `GLAMOUR` | +payout multiplier |
| `TRAFFIC` | +pull rate (spins/sec) |
| `LUCK` | +rare-symbol weight |
| `SECURITY` | −Heat generation, −payout |
| `NOISE` | −payout to neighbours (emitted by high-rate machines) |
| `POWER` | required by Mega-tier machines; falls off with distance |

Strength falls off with distance (smooth curve, not binary). Overlaps stack with
diminishing returns to prevent degenerate super-clumps.

### 6.3 The placement puzzle

Real tension, not decoration:
- `NOISE` emitters want to be near `TRAFFIC` (for rate) but hurt `GLAMOUR` neighbours.
- `SECURITY` is needed near high-Heat machines but dampens their payout.
- `POWER` plants are ugly (big `NOISE`) but Mega Slots cannot run without them.
- Plots have **terrain features** (river, plaza, ruin, ley-line) that emit their own
  auras — the map itself is a partner in the puzzle.

### 6.4 Districts & plots

- A **District** is one continuous canvas. Starts small, expands by buying adjacent
  **Plots** with Cash.
- Plots are **procedurally generated** on district creation: shape, terrain features,
  and a seeded modifier (e.g. `FLOODPLAIN: −20% footprint space, +40% LUCK`).
- Multiple districts unlock at Buyout tier; split panes (terminal tier 3) let you
  watch two at once.

---

## 7. Machines

### 7.1 Archetypes

Target ~60–90 authored archetypes across six families. Each family has a
**distinct interaction feel** — never a reskin.

| Family | Feel | Core mechanic |
|--------|------|---------------|
| **SLOT** | Composition | Symbol grid; symbols interact with adjacent symbols (the *Luck be a Landlord* engine). The deepest family. |
| **PINBALL** | Spatial | You place bumpers/targets *inside* the machine; a simulated ball scores chains. Placement puzzle within the placement puzzle. |
| **WHEEL / PLINKO** | Variance dial | Player explicitly sets a risk curve: flat-and-safe vs. spiky-and-huge. |
| **CARD / DICE** | Sequencing | Resolves over multiple steps; player can intervene once per resolution (hold/fold/double). |
| **MEGA SLOT** | District-scale | Consumes the *output* of adjacent machines as fuel; charges over minutes; detonates for a district-wide payout. Huge `POWER` and `NOISE` footprint. |
| **SUPER CASHOUT** | Event | Rare, charged manually. Escalating tiers with a genuine stop-or-push decision. The ritual moment. |

### 7.2 Symbol & module composition

The retention engine. Machines have slots; you install symbols/modules.

- Symbols pay out on their own **and** react to neighbouring symbols in the machine
  (e.g. `⚿ KEY` unlocks adjacent `▣ VAULT`; `☄ COMET` multiplies everything in its row).
- Placement *within* the machine matters — the same set of symbols in a different
  arrangement scores differently.
- ~120 authored symbols at launch scope, designed for synergy density, not count.
- Symbols are found, won from NPCs, or drawn from procedural pulls.

### 7.3 Procedural affix system (this is where "infinite" comes from)

Every machine instance is `archetype × rarity × affixes × set-tags`.

```
[ MEGA SLOT "BRASS CATHEDRAL" ]          ◆◆◆◆◇  EPIC
  base           ▸ 4.2e7 ¢/pull
  + SCORCHING    ▸ +180% payout, +2.4 Heat/pull
  + TETHERED     ▸ shares LUCK aura with 1 adjacent machine
  + HOLLOW       ▸ −1 symbol slot
  set: CATHEDRAL (2/4)  ▸ +20% POWER efficiency
```

- **Rarity tiers:** Common → Uncommon → Rare → Epic → Legendary → Mythic → (world-tier
  exclusive tiers beyond).
- **Affix pool grows with Deeds spent and world tier.** Higher tiers unlock affixes
  that change *rules*, not just numbers (e.g. `RECURSIVE: this machine's payout
  re-triggers its own resolution once`).
- **Set tags** encourage collection-building across archetypes.
- Affixes can be **negative** — a Mythic with a brutal drawback is a real decision,
  not an auto-equip.

This gives combinatorial infinity from a finite, hand-tuned, *quality-controlled*
content pool. No procedurally generated filler.

---

## 8. Progression & Prestige

### Three layers

**1. CASHOUT** — *minutes to hours*
Liquidate the district. Cash → **Chips**. Keep: Chips, machine blueprints,
terminal tier. Lose: district layout, Cash, installed machines.
Chips buy permanent global multipliers and **aura range**, which makes every
subsequent layout better — the reset is a genuine skill expression, not a grind.

**2. BUYOUT** — *hours to days*
Sell the whole region. Chips → **Deeds**. Keep: Deeds, Influence, symbol collection,
NPC standing. Lose: Chips, districts, plots.
Deeds unlock new machine archetypes and expand the affix pool. New region =
new procedurally generated plots and a fresh NPC neighbour map.

**3. SYNDICATE ASCENSION** — *days to weeks*
Everything resets to **Influence**. Unlocks the next **World Tier**.

### World tiers — the long tail

Each world tier re-rolls the rules rather than the numbers:

| Tier | Rule change (examples) |
|------|------------------------|
| I | Baseline. |
| II | Symbols can chain-trigger once. Mega Slots gain a second fuel input. |
| III | Auras propagate *through* buildings. Negative auras can be inverted. |
| IV | Heat becomes a spendable resource, not just a meter. |
| V | Machines can be nested — a machine can occupy another machine's symbol slot. |
| VI+ | Procedurally combined rule-mutators drawn from the pool above. |

Target: **tiers I–V hand-authored**, VI onward combining authored mutators — so
long-tail play is still *designed*, just recombined. Honest expectation: hundreds of
hours of meaningful progression, then combinatorial play indefinitely.

### Pacing targets

- First payout: **< 20 s**
- First machine placed: **< 60 s**
- First Cashout available: **~20 min**
- First Buyout: **~6–10 h** of play
- First Ascension: **~40–60 h**
- Each world tier: **1.5–2×** the previous in length, softened by accumulated Influence.

---

## 9. The NPC World

### 9.1 The neighbour ladder

| Rank | Entity | Behaviour |
|------|--------|-----------|
| 1 | **Kingdoms** | Small, passive. Trade and tribute. Tutorial tier for diplomacy. |
| 2 | **Cities** | Active. Raid you, steal blueprints, accept wagers. |
| 3 | **Mega Cities** | Multi-stage sieges. Run their own Heat economy and machine builds that visibly evolve over time. |

Neighbours are placed on a procedurally generated regional map (rendered as ASCII,
naturally) and have: a bank, a machine loadout, a Heat level, a disposition toward
you, and a simple simulated economy that grows whether or not you interact.

### 9.2 Five diplomacy verbs — and no more

1. **TRADE** — exchange symbols/blueprints/Bandwidth at a negotiated rate.
2. **TRIBUTE** — pay Cash to lower their aggression, or demand tribute if you dominate.
3. **WAGER** — the duel (below). The headline verb.
4. **RAID** — spend Heat to attack directly; steal Cash or a machine. They raid back.
5. **ALLY** — shared aura bonus across the regional map; mutual defense; breaks loudly.

### 9.3 Wager Duels — gambling *is* the combat system

Rather than bolting a battle system onto a gambling game, combat is a bet:

1. Both sides **stake** a percentage of bank.
2. You submit a **machine loadout** (up to N machines with their symbols/affixes).
3. The duel resolves as a **seeded, deterministic simulation** over several rounds:
   each round both loadouts "pull"; higher payout wins the round; certain affixes
   and symbols have duel-specific effects (`SCORCHING` burns an opponent symbol,
   `TETHERED` protects a machine, etc.).
4. You watch it resolve as an animated ASCII scoreboard. It takes ~20 seconds and it
   is the most tense thing in the game.
5. Winner takes the pot, plus a spoil: territory, a blueprint, a symbol, or a
   trade route.

Because it is deterministic from a seed, duels can be **simulated offline** for the
Night Shift Report, replayed, and shared as a seed string. No server needed.

### 9.4 Sieges (Mega Cities)

A siege is a **best-of-N wager series** with escalating stakes and a between-round
build phase — you may reconfigure your loadout after seeing what they used. This is
the closest the game gets to a boss fight.

---

## 10. Offline & Session Return

No background execution is possible in an iOS web app, so offline progress is
computed from a timestamp delta on resume. Design around that honestly:

- **Night Shift Report** on return — an animated ASCII ticker, not a number popup:
  ```
  > UPLINK RESTORED. 7h 21m ELAPSED.
  > RECONSTRUCTING LOG...
  [03:14] SLOT-A2 ......... 8.2e11 ¢
  [04:40] MEGA-S DETONATED  4.1e13 ¢
  [05:02] RAID: PORT VYSS — REPELLED (+2 SYMBOLS)
  [06:55] HEAT PEAK 82% — 1 AUDIT AVOIDED
  ─────────────────────────────────────
  TOTAL ▸ 5.9e13 ¢     [1 BANKED PULL AVAILABLE]
  ```
- Offline earns at a **reduced rate** that improves with upgrades (start ~50%, reach
  100%+). Standard, and it gives a clean upgrade axis.
- Offline duration is **capped** and the cap is upgradable (start 4h → 8h → 24h → ∞).
- **One banked pull** on return — a single free Super Cashout charge. Creates a
  reason to open the app that is not guilt.
- Duels and raids that happened offline are shown as replayable seeds.

Explicitly rejected: energy systems, daily login streak pressure, timed limited
events, anything that punishes not playing.

---

## 11. Meta Systems

- **Blueprint archive** — every machine archetype/affix combination you have owned,
  catalogued. Completionist track that survives all resets.
- **Symbol codex** — discovered symbols with their synergy notes, auto-documented as
  you find interactions. Doubles as the game's manual.
- **Statistics terminal** — full transparency: actual RNG rates, your lifetime
  pull count, expected vs. realized payout, luckiest/unluckiest streak. An
  anti-dark-pattern feature; the odds are always visible.
- **Achievements** as `COMMENDATIONS`, each granting a small permanent bonus.
- **Seed sharing** — export a district layout or duel seed as a short string.
- **Photo mode** — export the current ASCII viewport as text or PNG. The aesthetic
  is inherently shareable; lean into it.

---

## 12. UI/UX & iOS Web App Specifics

### Verified platform facts (as of 2026)

- Adding to the Home Screen on modern iOS opens a **real standalone web app**
  (not a Safari tab). EU support was briefly threatened in early 2024 and
  **restored in iOS 17.4** — this is not a blocker for EU devices.
- **Web push works, but only for home-screen-installed apps** (iOS 16.4+). A plain
  Safari tab cannot receive push.
- **No background execution, no background sync.** Offline progress must be
  timestamp-derived (§10).
- **No install prompt API** on iOS (`beforeinstallprompt` is unimplemented), so a
  manual "Share → Add to Home Screen" coach screen is required.
- Storage quotas are large, but **eviction after long inactivity remains possible**.
  Mitigate with the Persistent Storage API request *and* a manual save export.

### Requirements

- `display: standalone`, `apple-mobile-web-app-capable`, custom status bar style,
  splash screens for common device sizes.
- Respect `safe-area-inset-*` — the channel bar must clear the home indicator.
- **One-handed reachability**: all primary actions in the bottom third of the screen.
- Touch targets ≥ 44 pt despite the tiny-text aesthetic. The *text* is small; the
  *hitboxes* are not.
- Haptics via the Vibration API where supported (note: **Safari support for
  `navigator.vibrate` is unverified and likely absent** — treat haptics as a
  progressive enhancement, never a required feedback channel).
- Full offline capability via service worker. The game must work in airplane mode.
- Prevent double-tap zoom, rubber-band scroll, and text selection in the viewport.
- Dark by default (it is a terminal). A light "paper terminal" theme as an option.
- Respect `prefers-reduced-motion`: disables CRT effects, text crawl, and screen shake.

---

## 13. Technical Architecture

### Stack (proposed)

- **TypeScript + Vite**, no UI framework. The entire UI is a character grid; a
  virtual DOM is the wrong tool.
- **Canvas 2D with a cached glyph atlas** — draw each glyph once per charset/color
  into an offscreen atlas, then `drawImage` per cell. This is the established
  approach for web terminals and comfortably handles a ~100×50 cell grid at 60 fps
  on mobile. WebGL is a later optimization if effects demand it.
- **Dirty-cell diffing** — only re-blit changed cells.
- `break_infinity.js` (or equivalent) for big numbers.
- A seeded PRNG (xorshift/PCG) — **all** randomness is seeded and reproducible.

### Simulation

- **Fixed-timestep deterministic tick** (e.g. 10 Hz sim, 60 Hz render), fully
  decoupled from render.
- Offline catch-up runs the same tick function in a fast loop with a bounded
  iteration count, falling back to closed-form approximation for very long gaps.
- Determinism is a hard requirement: it is what makes offline duels, replays, and
  seed sharing possible, and it makes balance testable.

### Persistence

- IndexedDB primary, `localStorage` mirror for a small "last known good" snapshot.
- Versioned save schema with forward migrations from day one.
- Autosave on every meaningful action **and** on `visibilitychange` (iOS kills
  backgrounded web apps without warning — never rely on `beforeunload`).
- **Manual export/import** of a save blob (clipboard + file). Non-negotiable given
  storage eviction risk.
- Optional later: cloud sync. Deliberately out of scope for v1.

### Testing

- Deterministic sim ⇒ golden-seed regression tests over long simulated runs.
- Automated balance harness: simulate N hours of play under several strategies,
  assert progression stays within pacing targets (§8).

---

## 14. Build Phases

### Phase 0 — Skeleton
Glyph-atlas renderer, character grid, touch pan/zoom, PWA shell, save system,
deterministic tick loop. No gameplay. Proves the hardest technical risk first.

### Phase 1 — MVP (the actual game, small)
- One district, free-form placement, 3 aura types
- SLOT + WHEEL families, ~15 archetypes, ~30 symbols
- Cash + Chips, Cashout only
- Heat meter
- Terminal tiers 0–2
- Offline earnings + Night Shift Report

**Ship-quality target: this alone should be fun for 3+ hours.** If it is not, adding
neighbours will not save it.

### Phase 2 — Depth
PINBALL + CARD/DICE + MEGA SLOT + SUPER CASHOUT, full affix system, Buyout layer,
plots and terrain, symbol codex, terminal tier 3.

### Phase 3 — The world
NPC neighbours, five diplomacy verbs, Wager Duels, raids, regional ASCII map.

### Phase 4 — The long tail
Syndicate Ascension, world tiers I–V, sieges, mega cities, terminal tiers 4–5,
seed sharing, statistics terminal.

### Phase 5 — Polish & flex
CRT effects, photo mode, alternate palettes, command-line automation layer,
accessibility pass, balance harness tuning.

---

## 15. Open Questions

1. **Command line as automation endgame?** *Stone Story RPG* ships *Stonescript*, a
   player-facing scripting language, and it is widely cited as a highlight. A
   `BAUDA/OS` shell where late-game players script machine reconfiguration and
   auto-wagering fits the fiction perfectly — but it is a large feature and a
   difficulty cliff. Proposal: build the command line early as a *convenience*
   (`build slot a2`, `goto district 2`), expand to scripting only in Phase 5.
2. **Art scale.** Stone Story took 9 years and 16,000 hand-drawn ASCII frames. That
   is not the target. Proposal: procedurally assembled glyph sprites with a small
   number of hand-authored animation frames for hero moments (Super Cashout, Mega
   Slot detonation, duel resolution) only.
3. **How punishing should MELTDOWN be?** Currently drafted as a genuine loss.
   Needs playtesting — it may need a one-time-per-cycle insurance mechanic.
4. **Does non-grid placement survive touch input?** Precise sub-cell placement on a
   phone needs a good interaction (proposal: drag to place a ghost, then a
   magnified nudge-pad for fine positioning). This must be prototyped in Phase 0 —
   if it feels bad, the whole placement pillar is at risk.
5. **Font licensing** — needs a permissively-licensed monospace font with verified
   Braille and box-drawing coverage. Unresolved.

---

## 16. References Consulted

Design patterns drawn from, and verified during research:

- **Luck be a Landlord** / **Ballionaire** — symbol synergy as the core engine;
  "spin → score → add symbol → pay → add item" loop; the build, not the RNG, is
  the retention.
- **ISLANDERS** — free placement with proximity-based scoring; buildings gain or
  lose points from what is nearby. (Diverged from: *Islanders* forbids relocation.)
- **Trimps** — spatial/survival mechanics layered onto incremental; difficulty
  spikes that force prestige.
- **Realm Grinder** — faction/alignment modifiers producing radically different
  playstyles from the same economy.
- **Idle Casino Manager** — mainstream idle casino pacing, floor expansion,
  investor/prestige loops.
- **Stone Story RPG** — animated ASCII as a premium aesthetic; *Stonescript* as a
  player-facing automation layer; incremental influence on an action RPG.
- **Cogmind** — terminal rendering architecture; wide glyphs spanning multiple cells
  to escape uniform-grid monotony.
