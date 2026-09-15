# BAUDA — Features & Design Document

> A 3D idle empire builder rendered entirely as ASCII, with gambling mechanics.
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

## 2. Presentation: 3D world, ASCII output

### 2.1 The approach — real 3D, ASCII as a post-process

The world is a genuine 3D scene viewed from an angled top-down orthographic camera.
It is never drawn as characters by hand. Instead, the rendered frame is converted to
ASCII by a post-processing pass, the way a shader would apply cel-shading:

```
  3D scene            low-res render        ASCII conversion         character
  (low-poly     ──▶   target               ──▶  pass             ──▶  cell buffer
   meshes)            (1 texel per cell)        (luminance +          (composited
                      + depth + normals          edges + color)        with UI)
```

**The pipeline, concretely:**

1. **Render** the scene with an orthographic camera at a fixed pitch (~35–40°) into an
   offscreen target whose resolution equals the character grid (e.g. 96×54), plus
   depth and normal buffers.
2. **Luminance → fill ramp.** Per cell, map brightness to a density ramp:
   `` ` .:-=+*#%@ `` — this gives volume and shading.
3. **Edges → directional glyphs.** A difference-of-Gaussians pass finds structural
   edges; a Sobel operator gives each edge a *direction*, quantized into four
   buckets rendered as `| / — \`. This is the step that makes it read as 3D
   geometry instead of luminance mush — silhouettes, roof ridges, and building
   corners come through as clean lines.
4. **Normals → glyph set selection.** Surface orientation picks which sub-ramp a cell
   uses, so roofs, walls, and ground are visually distinguishable even at equal
   brightness.
5. **Color.** Per-cell foreground color sampled from scene albedo, quantized to the
   current palette tier (§2.4).
6. **Composite.** The result is written into the *same character cell buffer* as the
   UI chrome, so the world view and the control panel are one unified terminal image
   rather than a 3D canvas with UI floating over it.

This is a well-established technique — three.js ships a `SobelOperatorShader`, and
Acerola's ASCII shader (DoG + Sobel + quantization) has open HTML-canvas
implementations to reference. ASCIICKER proves the whole concept is viable in a
browser: full 3D, rendered entirely as colored ASCII, since 2017.

### 2.2 Why this resolves the grid problem

ASCII is a character grid; the building system is not. With a 3D scene and an ASCII
post-process, that conflict simply does not exist:

- The world is **continuous 3D space**. Buildings sit at float `(x, y, z)` with float
  rotation and float-radius auras.
- The character grid is only the **display resolution** — like a very low-res monitor.
- Placement precision is bounded by raycast accuracy and zoom, **not** by cells. Zoom
  in and you place as finely as you like.
- Camera rotation (4 fixed steps, or free orbit at higher terminal tiers) is free —
  it is a real camera on a real scene.

### 2.3 Why this is also the cheapest art pipeline

The ASCII pass destroys fine detail by design. That means:

- **Low-poly, untextured meshes are sufficient** — and in fact look better, because
  clean silhouettes survive the conversion while detailed models turn to noise.
- **Silhouette-first modelling.** A building needs a readable outline and a couple of
  strong planes; nothing else reaches the screen.
- **Everything is automatically art-consistent.** Whatever goes in comes out looking
  like the same game.
- No sprite sheets, no hand-drawn animation frames. Compare *Stone Story RPG*:
  16,000 hand-drawn ASCII frames over nine years. That is not a viable budget here;
  this pipeline avoids needing it.
- Animation is mesh transforms and shader parameters, not redrawn characters.

This is the single biggest production-cost decision in the document, and it is why
the 3D approach beats hand-authored ASCII art for this project.

### 2.4 Terminal progression — the uplink track

Because the ASCII conversion is parameterized, **the renderer itself becomes the
progression track.** Upgrades bought with Bandwidth literally improve the picture:

| Tier | Baud | Grid | Colors | Render quality |
|------|------|------|--------|----------------|
| 0 | 300 | 40×24 | 2 (amber/black) | Edge glyphs + flat 2-shade fill. Crude but identifiable. Text crawls in. Manual refresh. |
| 1 | 1200 | 48×30 | 4 | + shading depth. Buildings gain volume. Auto-refresh 1 Hz. |
| 2 | 9600 | 64×36 | 8 | + directional Sobel glyphs, normal-based glyph sets. Real 3D readability. Live camera. |
| 3 | 57.6k | 80×45 | 16 | + free camera orbit, split panes, aura heatmap overlay. |
| 4 | 1M+ | 100×56 | 256 | + full-rate redraw, animated effects, ghost placement preview, depth fog. |
| 5 | "direct neural" | 120×68 | truecolor | + CRT bloom, scanlines, phosphor persistence, chromatic aberration. Cosmetic flex tier. |

The world **visibly resolves into clarity** as you progress. At tier 0 you read a
coarse outline sketch of your district; by tier 4 you are looking at a crisp animated
schematic of a city. That is a far stronger reward than a number going up, and it
costs nothing to build once the pipeline is parameterized.

**Revised after Phase 0 (see §16).** The original plan turned edge detection off at
tier 0. Testing showed that removes building *identity*, not just fidelity — the
district became an unreadable smear rather than a crude sketch. Edges carry form;
shade count carries depth. Tier 0 therefore keeps edges and earns its primitiveness
through grid size, 2-shade flat fill, and the text crawl.

Tiers also **zoom**: lower tiers frame fewer, larger buildings, so legibility is
preserved rather than sacrificed. The exponent is under 1, so higher tiers still
show meaningfully more of the city.

Early friction is real but must be brief — tier 1 within ~3 minutes of first launch,
tier 2 within ~15. The opening squint is a hook, not a wall.

### 2.5 Aura visualization

Proximity auras (§6.2) are rendered as **ground-plane emissive shading** in the 3D
scene, which the luminance ramp then converts to character density for free:

```
 `  .  :  -  =  +  *  #  %  @      ← increasing aura density
```

A well-optimized district literally glows brighter. Overlapping auras read as a
heatmap you are looking at in 3D, so "is this placement good?" is answerable at a
glance without opening a panel. Toggleable overlay; unlocked at terminal tier 3.

### 2.6 Panel layout

The app is framed as an OS — `BAUDA/OS` — not as a game menu system. The 3D viewport
occupies a region of the character grid; everything else is terminal chrome drawn
into the same buffer.

```
┌─ BAUDA/OS v0.1 ──────────────── 9600 baud ─ [HEAT 34%] ─┐
│ DISTRICT: NEON FLATS              BANK ▸ 4.812e9 ¢      │
├─────────────────────────────────────────────────────────┤
│         ___                                             │
│       /###\__          ,:=+*#%@%#*+=:,                  │
│      |#####|\        ,=+*#%@@@@@%#*+=,    [SLOT-A2] ▸ ON│
│      |#####| |      :+*#%@@@@@@@@@%#*+:   [PINB-01] ▸ ON│
│      \_____|/        `=+*#%@@@@@%#*+=`    [MEGA-S ] ▸ 71│
│        |___|           `,:=+*#%#*+=:,`    ══════════▸    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ > _                                                     │
├─────────────────────────────────────────────────────────┤
│ [MAP] [MACH] [NET] [OPS] [SYS]                          │
└─────────────────────────────────────────────────────────┘
```

- **Top bar** — persistent state: baud rate, Heat, bank.
- **Viewport** — the 3D→ASCII district. Drag to pan, pinch to zoom, two-finger twist
  (or `Q`/`E`-equivalent buttons) to rotate.
- **Command line** — optional power-user input (see §15.1). Hidden until unlocked.
- **Side strip** — live machine status, collapsible.
- **Channel bar** — the 5 primary nav channels.

### 2.7 Visual identity

- Monospace-only, self-hosted font. Requirements are modest: standard ASCII ramp plus
  box-drawing. No exotic Unicode blocks required, which sidesteps a real font-coverage
  risk.
- Palette: phosphor amber default; green, ice-blue, and magenta unlockable.
- Optional CRT post-processing: scanlines, slight barrel distortion, phosphor
  persistence. Must be toggleable — it will nauseate some players.
- Boot sequence on cold launch. Short: 2 seconds, always skippable by tap.

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

- Continuous float coordinates in real 3D space. No grid, no snapping (optional
  soft-snap toggle for accessibility).
- Buildings have a **footprint** (collision polygon), a **height**, and one or more
  **aura radii**. Free rotation on the vertical axis.
- Placement is legal if footprints do not overlap and the point is inside an owned plot.
- **Interaction:** drag to summon a ghost mesh that follows a raycast onto the ground
  plane; a live aura-delta readout shows the income change before you commit; release
  to place. Pinch-zoom for fine positioning, plus a magnified nudge-pad for
  sub-unit adjustment. Placement is never blocked by display resolution — only by
  how far you have zoomed in.
- **Height matters at higher tiers**: tall buildings cast aura shadows and occlude
  the camera, so vertical layout is a later-game dimension of the same puzzle.
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
- **WebGL contexts are discarded on backgrounding.** `webglcontextlost` /
  `webglcontextrestored` must be handled — rebuild the glyph atlas and render targets
  on restore. Untested assumption to verify in Phase 0: how aggressively iOS drops
  the context when the app is merely off-screen briefly.

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
- **WebGL for the world, one glyph-atlas pass for output.** Two stages:
  1. **Scene pass** — low-poly meshes, orthographic camera, rendered to an offscreen
     target at *character-grid resolution* (≈96×54 = ~5k pixels, i.e. smaller than a
     thumbnail) plus depth and normal buffers. This is almost free on mobile GPUs;
     the low target resolution is the whole performance story.
  2. **ASCII pass** — a single fullscreen quad shader: luminance ramp +
     difference-of-Gaussians + Sobel direction + normal-based glyph selection →
     index into a **glyph atlas texture**, output colored characters.
- **three.js** for v1 (ships `SobelOperatorShader`, saves weeks). If bundle size or
  control becomes a problem, replace with a minimal custom WebGL renderer — the
  approach ASCIICKER took, and the scene requirements here are simple enough that
  this is a realistic fallback rather than a rewrite.
- **UI chrome** is written into the same cell buffer as the ASCII pass output, so the
  final frame is one unified character grid — not a 3D canvas with HTML on top.
- **Dirty-cell diffing** for the static chrome regions; the viewport redraws wholesale
  (it is cheap).
- **Handle WebGL context loss** — iOS discards GL contexts on backgrounding without
  warning. Context restore must rebuild atlas + targets and resume cleanly.
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

### Phase 0 — Skeleton (de-risking pass)
3D→ASCII render pipeline, glyph atlas, unified cell buffer, orthographic camera with
touch pan/zoom/rotate, raycast ghost placement, PWA shell, save system, deterministic
tick loop. No gameplay.

Three questions this phase exists to answer, in order:
1. Does the 3D→ASCII output **read clearly** at 64×36 on a phone screen?
2. Does **continuous placement by touch** feel good?
3. Does it hold **60 fps** on a mid-range iPhone with CRT effects on?

If (1) or (2) fails, the design changes before any content exists. That is the point.

### Phase 1 — MVP (the actual game, small) — **BUILT**
- One district, free-form placement, six aura types
- SLOT + WHEEL + SUPPORT families, 15 archetypes, 30 symbols
- Cash + Chips, Cashout, five Chip upgrade tracks, Bandwidth and uplink purchase
- Heat meter with five bands
- Terminal tiers 0–2 (bought with Bandwidth)
- Offline earnings + Night Shift Report
- Four channels: MAP, MACH, OPS, SYS

**Ship-quality target: this alone should be fun for 3+ hours.** If it is not, adding
neighbours will not save it. Results in §16.2.

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
2. **Art scale.** Resolved by the 3D pipeline (§2.3): low-poly untextured meshes,
   silhouette-first, no hand-drawn frames. Remaining question is *who models them* —
   ~60–90 machine archetypes plus support buildings is a real but tractable art
   task, and the meshes can be crude. Primitive-composition (boxes, cylinders,
   wedges assembled procedurally from a parts list) may cover most of it.
3. **How punishing should MELTDOWN be?** Currently drafted as a genuine loss.
   Needs playtesting — it may need a one-time-per-cycle insurance mechanic.
4. **Does non-grid placement survive touch input?** Raycast ghost placement plus a
   nudge-pad is the proposal, but this must be prototyped in Phase 0 — if it feels
   bad, the whole placement pillar is at risk.
5. ~~**Legibility at low cell counts.**~~ **Answered in Phase 0 (§16).** At 40
   columns a district is readable *if and only if* directional edge glyphs are on
   and the camera zooms in to suit the tier. Both are now in the design. Remaining
   sub-question: whether tier 0 still needs unit labels on top of that.
6. **Camera rotation vs. spatial memory.** Free orbit is expressive but players lose
   track of their own city. Proposal: 4 fixed 90° steps by default, free orbit
   unlocked as a tier-3 option, with a compass always visible.
7. **Font licensing** — needs a permissively-licensed monospace font. Requirements are
   now modest (ASCII + box-drawing only), so this is low risk, but unresolved.

---

## 16. Phase 0 Results

Phase 0 is built (`src/`, run with `npm run dev`). It is the render pipeline, camera,
placement, terminal chrome, sim loop, save system and PWA shell, with no gameplay —
its job was to answer three questions before any content exists. Verified with an
automated harness (`npm run shots`) that drives a real browser at iPhone dimensions,
screenshots every tier, and dumps the literal character grid to text so output can be
diffed rather than eyeballed.

### Q1: does the 3D→ASCII output read clearly on a phone? — **Yes, conditionally**

- At **64 columns** (tier 2) individual buildings are clearly distinguishable: the
  wheel's disc-on-a-mast, the mega complex's stepped mass, security towers, pinball
  ramps. The approach works.
- At **40 columns** (tier 0) it works *only with edge glyphs enabled*. Without them
  the district is an amber smear with no identifiable structure. This was the single
  biggest finding and it changed the tier table (§2.4).
- **Edges must be gated on real geometry.** A luminance-only edge pass fires on the
  aura heatmap painted across the ground and fills the screen with meaningless
  diagonals. The fix is a depth laplacian (zero across any flat plane however steeply
  it recedes, spikes at silhouettes) plus a normal-discontinuity term. The gate must
  also be strict: a loose threshold turns every facet of a low-poly cylinder into an
  edge and buildings dissolve into line spaghetti.
- **Portrait framing needs its own solution.** Sizing the orthographic camera by
  half-height collapses the visible width on a 0.46-aspect phone. Zoom is defined by
  half-*width*, and the camera pitch was raised from ~35° to ~49°, because a shallow
  angle projects a square district into a squat rhombus that wastes a tall screen.

### Q2: does continuous placement survive touch? — **Mechanically yes, ergonomically unproven**

Raycast ghost placement with a live income-delta readout works, and two units placed
0.25 world units apart — far finer than one character cell — resolve as distinct
positions with different yields. The character grid demonstrably does not quantize
position. What is *not* proven is how it feels under a thumb on a real device; that
needs a human with a phone, not a headless browser.

### Q3: does it hold frame rate? — **Unverified, and honestly so**

The only GPU available here is SwiftShader (software rasterization), so absolute
numbers are meaningless: 9–26 fps across tiers, which a real mobile GPU would not
resemble. The useful signal is relative — tier 5 costs roughly 2.5× tier 0, which
tracks cell count as designed rather than revealing a pathology. The architecture's
central performance claim (the scene renders to ~5k pixels; the per-pixel pass is two
texture fetches) is structurally sound but **must be measured on real hardware
before it is believed**.

### Other results

- **Font coverage: no gaps.** Every glyph in the charset, box drawing and diagonals
  included, rendered from the system monospace stack. The atlas builder probes each
  glyph and substitutes an ASCII fallback for any blank, so a font-poor device
  degrades instead of showing tofu.
- **Save export/import round-trips** correctly; schema is versioned with migrations.
- Two bugs worth recording because both are invisible in code review and obvious on
  screen: the UI cell buffer is authored top-down while texture V runs bottom-up (the
  HUD rendered upside down), and `CanvasTexture` defaults to `flipY: true` (every
  glyph rendered vertically mirrored).

### Phase 0: what it says about the design

The 3D→ASCII pipeline is validated as the right call: low-poly untextured primitives
do produce readable output, confirming the cheap-art claim in §2.3. The open risks
that remain are ergonomic and performance-related, and both need a physical device.

---

## 16.2 Phase 1 Results

Phase 1 is built. Verified with `npm run verify`, which runs the real production
bundle in a real browser: a scripted simulated player (`src/dev/autoplay.ts`) plays
for hours of simulated time, and the harness reports when each pacing milestone was
reached. It also checks determinism and captures every channel.

### Pacing, measured against the §8 targets

| Target | Design | Measured (3 seeds) |
|--------|--------|--------------------|
| First payout | < 20 s | **6 s** |
| First machine placed | < 60 s | immediate (starting stake covers it) |
| First Cashout available | ~20 min | **17.4 / 17.4 / 19.4 min** |
| Terminal tier 1 | ~3 min | **2.3 / 3.0 / 2.4 min** |
| Terminal tier 2 | ~15 min | **10.1 / 10.4 / 10.3 min** |

Long-horizon growth compounds: ~5.5e5 total cash at 3 hours, ~2.7e7 at 12 hours.
Determinism holds — identical seeds reproduce exactly, different seeds diverge.

### Three bugs the harness found that review would not have

1. **Cashout was an unrecoverable dead end.** It reset cash to zero *and* removed
   every machine, so the player had nothing to rebuild with and income stayed at
   zero forever. A prestige layer must leave a stake; it now scales with Chips, so
   later runs restart faster, which is the point of the reset.
2. **Heat saturated instantly.** Driving it from spin count meant any district of
   real size pinned at 100% within minutes, which removed the decision entirely.
   Heat is now an *equilibrium* seeking a target set by aura density per machine
   minus Security — so it stays a placement question at any scale, as §5 intends.
3. **MELTDOWN became a metronome.** With heat at its ceiling, meltdown fired every
   105 seconds forever: a tax, not a gamble. Passive play is now capped at CRITICAL
   (×4.0); reaching MELTDOWN will require a deliberate push action. Tracked as
   issue #15.

### Balance notes

Chip yield is `3 × (run earnings / 25k)^0.45` and upgrade costs scale `1.42^level`.
These two exponents set the entire prestige cadence and are the first thing to
touch when the curve feels wrong. The Cashout *gate* (60k) is deliberately separate
from the Chip *divisor* (25k) so raising the gate does not also cut Chip yield.

### Known gaps in Phase 1

Meltdown is unreachable passively by design, pending the push action. The event log
records draws and milestones but not payouts. Symbol acquisition is draw-only —
no rewards from play yet. All tracked as issues.

---

## 17. References Consulted

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
- **ASCIICKER** (msokalski/Gumix, 2017–) — proof that a full 3D game rendering
  entirely to colored ASCII works in a browser: 3D computed in wasm, output through a
  custom minimal WebGL renderer that draws colored ASCII cells. The closest existing
  thing to this project's renderer.
- **Acerola's ASCII shader** — the modern 3D→ASCII technique: gaussian blur,
  difference-of-gaussians, Sobel operator for edge *direction*, and quantization;
  open HTML-canvas implementations exist to reference.
- **three.js `SobelOperatorShader`** — official post-processing addon; the edge-detection
  half of the pipeline is off-the-shelf.
- **Cogmind** — terminal rendering architecture; wide glyphs spanning multiple cells
  to escape uniform-grid monotony.
- **Return of the Obra Dinn** — precedent for a 3D game shipped through a severely
  constrained display filter, and for treating that filter as the art direction
  rather than a limitation.
