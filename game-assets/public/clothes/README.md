# Clothing asset contract

Every clothing item (hair, hat, tshirt, ...) is a TexturePacker-style
spritesheet: one atlas PNG + one JSON describing its frames, loaded through
PixiJS `Assets.load()`.

## The rule: everything shares the avatar's 80×120 canvas

The avatar body (`game-core/assets/toon/toon.json`) exports every direction's
frame on a **fixed 80×120 canvas** — the same size as the `Avatar` container.
The character is drawn in the same place on that canvas regardless of
direction, so a body-part sprite placed at `(0, 0)` always lines up. No offset,
no per-direction tuning, nothing hand-maintained.

Clothing must follow the same rule. For **every direction frame** in the JSON:

```jsonc
"hair7_1.png": {
  "frame":            { "x": 30, "y": 30, "w": 51, "h": 45 }, // where the crop sits in the atlas PNG — packer output, not yours to set
  "rotated":          false,
  "trimmed":          true,
  "spriteSourceSize": { "x": 17, "y": 19, "w": 51, "h": 45 }, // <- where the crop sits on the 80x120 canvas. THIS is the only thing you place by hand.
  "sourceSize":       { "w": 80, "h": 120 }                   // <- always 80x120, matches the avatar canvas
}
```

`spriteSourceSize.x/y` is the top-left of the artwork **as drawn on the full
80×120 avatar canvas** — i.e. exactly where you painted it in your source
file, before any packer trims the transparent margins away. If your export
tool trims and repacks automatically (any real TexturePacker-compatible
exporter does), this falls out for free — you never fill it in by hand.

PixiJS reads `trimmed` + `spriteSourceSize` + `sourceSize` natively (see
`Spritesheet.js`, `Container/measureMixin`) and positions the sprite itself.
`Clothe.ts` in game-core does **not** apply any app-side offset — there is no
"position" block to maintain anymore. If a garment looks off, the fix is in
this JSON's `spriteSourceSize`, never in the code.

## Directions

Only these 8 bitmask values have artwork: `1, 2, 4, 5, 6, 8, 9, 10`
(down, up, right, down-right, up-right, left, down-left, up-left — see the
diagram at the top of `game-core/src/game/avatar/Avatar.ts`). A clothing item
needs one frame per direction it supports, named `{id}_{direction}.png` (or
`{id}_bd_{direction}.png` for a tshirt's torso layer — see `Tshirt.ts`).

## Categories

Registered in `game-core/src/game/avatar/ClotheRegistry.ts`, each with a
matching folder here and a z-order slot in `partsConfig.ts`:

| category | folder      | what it is                          |
|----------|-------------|--------------------------------------|
| `hair`   | `hair/`     | hairstyle                            |
| `hat`    | `hat/`      | hat, over hair                       |
| `face`   | `face/`     | glasses/mask, over hair, under hat   |
| `tshirt` | `tshirt/`   | torso layer (+ optional sleeves, see below) |
| `pant`   | `pant/`     | legs, drawn over the torso layer     |

Adding a new category needs a small `Clothe` subclass (see `Hat.ts`/`Face.ts`
— ~10 lines) plus a `ClotheRegistry.register()` call and a `PARTS_CONFIG`
entry with the right `order`.

## Arm sleeves (tshirt, and anything else that needs them)

Most sleeved items cover the arm on every direction except front/back
(`1`/`2`) — the bare torso texture handles those, the arm shows through
unclothed. A sleeve is a **separate animated overlay**, not part of the
item's own static frame: it has to sit at the exact z-order of the body arm
it covers (whatever `partsConfig.ts` currently gives that arm — both arms
render in front of the shirt as of this writing) and animate in lockstep
with it — see `ClotheSleeve.ts` in game-avatar.

Frame naming: `{id}_al_{direction}_{n}.png` (left arm) and
`{id}_ar_{direction}_{n}.png` (right arm), `n` starting at `0`. Same 80×120
trim contract as above.

**The frame count for `n` must exactly match the avatar body's own walk-cycle
length for that direction and side** (`al_wlk_{direction}` /
`ar_wlk_{direction}` in `game-core/assets/toon/toon.json`'s `animations`).
That length already includes the body's own held/repeated frames for
timing — matching it (not the count of visually distinct arm poses) is what
keeps the sleeve frame-locked to the arm with zero manual syncing in code:

| direction | al (left arm) | ar (right arm) |
|---|---|---|
| 1 (down)       | 3 | 3 |
| 2 (up)         | 3 | 3 |
| 4 (right)      | 6 | 1 |
| 5 (down-right) | 6 | 6 |
| 6 (up-right)   | 5 | 1 |
| 8 (left)       | 6 | 1 |
| 9 (down-left)  | 6 | 6 |
| 10 (up-left)   | 5 | 1 |

A direction with 1 frame there means that arm barely moves from that viewing
angle — a sleeve for it can just be a single static image at `_0`. To match
which pose each index actually shows (not just how many), look up that
direction's entry in `animations` — e.g. `al_wlk_1` is
`[human_al_1_1.png, human_al_1_0.png, human_al_1_0.png]`, so a left sleeve's
`_1_0.png` should match the arm's `_1.png` pose and `_1_1.png`/`_1_2.png`
both match `_0.png`'s pose (it's held for two steps).

No frames for a direction (including `1`/`2` on most items) means no sleeve
is drawn there — that's the normal, expected way to say "this item has no
sleeve on this facing", not an error.

## Animated bottoms (pant, and anything else that walks)

A `pant` item's own frame (not a sleeve — its main texture) can itself be
**animated**: a walk-cycle overlay instead of one static image per
direction. Runtime class is `AnimatedClothe`
(`game-avatar/.../clothes/AnimatedClothe.ts`), used by `Pant` instead of
the static `Clothe` base every other category uses.

Frame naming: `{id}_{direction}_{n}.png`, `n` starting at `0` — same as a
sleeve's frames, minus the arm-side infix (a pant is one overlay, not a
left/right pair). Same 80×120 trim contract as everything else in this
file.

**Unlike arm sleeves, the frame count does NOT need to match the body's own
walk-cycle length** (`lg_wlk_{direction}` in `toon.json`). A sleeve has to
stay frame-locked to the arm it partially reveals, or the body's bare arm
shows through misaligned. A pant sits at z-order `2.5` in `partsConfig.ts`
— above the legs (`1`) AND the torso (`2`), below the shirt (`3`) — so it's
drawn on top of the body, fully covering the legs and the bottom of the
torso underneath. Its frame count and timing (`AnimatedClothe`'s
`baseAnimationSpeed`) are entirely its own; there's nothing to sync.

**A direction with only `_0.png` is a static item for that facing** —
playing an `AnimatedSprite` with one texture does nothing visible, so this
falls out of the exact same code path as an animated item, not a separate
one. This is how a bottom with no animation at all (a skirt) is expressed:
every direction gets just its `_0.png`, no `_1.png`/`_2.png`/etc.

Worked example: `pant/pant1.json` — 5 directions of raw source art
(`1, 2, 4, 5, 6`, 6-9 frames each, one fixed crop size per direction across
its whole cycle) plus `8/9/10` generated by a straight horizontal mirror of
`4/5/6` (same convention the body itself uses — `spriteSourceSize.x`
mirrors as `80 - x - w`, no separate source art needed).

Three mistakes were made and corrected while building this asset, all
worth knowing about for the next one:

- **Which raw folder is which direction is not safe to infer from anything
  but the actual pixels.** The exporter's own numbering (`DefineSprite_N`)
  turned out to have no relationship to direction order — trusting it the
  first time round silently swapped several directions. What actually
  disambiguates a front/back or diagonal-front/diagonal-back pair for a
  garment with no front/back texture difference of its own is a *visual*
  detail that does differ: a back pocket. In this source art, the two
  "back" folders (`2` and `6`) show a small highlight rectangle the "front"
  ones (`1` and `5`) don't. The one true side-profile folder (narrowest
  silhouette, no front/back ambiguity possible) is `4`. Always verify the
  mapping this way — composite each candidate against the real body
  reference and look for a distinguishing mark — rather than trusting
  export/file ordering.
- **The rescale factor needs an empirical check, not just the reported
  export percentage.** The raw export here was done at 200% instead of the
  intended ~150%, so every source frame needs a `150/200 = 0.75` rescale
  before anything else — but don't stop at doing the arithmetic on the
  reported percentages; render the result composited against the real body
  reference (`game-core/assets/toon/sprites/human_lg_{d}_0.png` /
  `human_bd_{d}_0.png`) and check the waistband actually lines up with the
  torso's hip width with no gap and no overhang. A wrong rescale (this one
  went through a `0.6` guess first, which under-sized the garment badly
  enough to leave bare leg showing through the sides) is obvious once
  you're looking at the composite, and easy to miss if you only trust the
  math on a percentage someone reported from memory.
- **The vertical anchor was inverted: the garment was hidden entirely
  behind the torso.** The first build anchored the pant's *bottom* edge to
  the torso's bottom edge (`y = torsoBottom - pantHeight`), which places
  the whole garment *above* that line — i.e. inside the torso's own
  footprint, not hanging down over the legs below it. Composited with the
  correct z-order (legs `1` → pant `1.5` → torso `2`, torso drawn last/on
  top) this made the pant almost entirely invisible, just a sliver peeking
  out from under the shirt hem. It looked fine in an earlier check only
  because that check drew the pant *after* the torso (wrong order,
  opposite of `partsConfig.ts`), which incidentally hid the bug. Fixed by
  anchoring the pant's *top* edge a few px above the torso's bottom edge
  instead (`y = torsoBottom - overlap`, `overlap = 13`) — small enough to
  tuck the waistband under the shirt hem, large enough that the garment
  hangs down over the leg region where it's supposed to be. **Any
  future composite check for an overlay part MUST use the real z-order
  from `partsConfig.ts`. Checking with the wrong draw order can hide
  exactly this kind of bug** — as happened here, and note that
  `partsConfig.ts`'s pant order has since moved to `2.5` (above the torso,
  not below it — see the "Unlike arm sleeves" paragraph above), so the
  y-coordinate math above is historical context for how the offset was
  found, not a description of what's currently visible on screen.

The build script is `/tmp/.../scratchpad/pant_work/build_pant8.py` from the
session that produced it, not checked into this repo (one-off per source
art dump, not a general tool — that's what clothing-studio is for going
forward).

## Migration note (2026-09)

`hair7`, `hat_april1` and `tshirt_april7` were migrated from the old
hand-maintained `"position"` block to this contract — same pixel placement,
just expressed the standard way. Two gaps the old data never actually had
(direction `2` on all three, direction `8` on hat/tshirt) were filled with
direction `1`'s offset to preserve today's behavior exactly; look for
`_migrationNotes` in the affected JSON files — those specific facings were
never really tuned and may want a nudge.
