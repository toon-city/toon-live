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

## Arm sleeves (tshirt, and anything else that needs them)

Most sleeved items cover the arm on every direction except front/back
(`1`/`2`) — the bare torso texture handles those, the arm shows through
unclothed. A sleeve is a **separate animated overlay**, not part of the
item's own static frame: it has to sit at the exact z-order of the body arm
it covers (the right sleeve behind the torso like the back arm, the left one
in front like the front arm) and animate in lockstep with it — see
`ClotheSleeve.ts` in game-core.

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

## Migration note (2026-09)

`hair7`, `hat_april1` and `tshirt_april7` were migrated from the old
hand-maintained `"position"` block to this contract — same pixel placement,
just expressed the standard way. Two gaps the old data never actually had
(direction `2` on all three, direction `8` on hat/tshirt) were filled with
direction `1`'s offset to preserve today's behavior exactly; look for
`_migrationNotes` in the affected JSON files — those specific facings were
never really tuned and may want a nudge.
