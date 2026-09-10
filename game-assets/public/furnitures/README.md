# Furniture asset contract

Every furniture item (one category = one folder, e.g. `jardin/`) is a
TexturePacker-style spritesheet — one atlas PNG + one JSON per item — loaded
through `GameItemManager.getFurnitureBase(id, type, file)`
(`game-core/src/game/textures/GameItemManager.ts`), which resolves
`furnitures/{file}.json` via `AssetBaseUrl`. This is a **different contract
than clothing** (see `game-assets/public/clothes/README.md`) — furniture has
no shared fixed canvas, and carries a load-bearing ground-footprint polygon
clothing doesn't need.

## Naming

- **Folder = `items.sprite_key`** (the category, e.g. `jardin`).
- **Filename (no extension) = `items.sprite_path`** (the item id, e.g. `banc`).
- These concatenate everywhere the runtime needs a load path:
  `${spriteKey}/${spritePath}` → `furnitures/jardin/banc.json`.
- **Frame keys**: `{id}_{orientation}.png`, orientation `1..4`. Not every
  orientation needs a frame — `FurnitureView.updateTexture()` falls back to
  the first defined frame key when an orientation is missing (see
  `game-core/src/modules/furniture/FurnitureView.ts:48-51`). `banc.json`
  below only defines `1`/`2`; orientations `3`/`4` render as `1`.

## Frame contract, worked example (`jardin/banc.json`)

```jsonc
"banc_1.png": {
  "frame":            { "x": 30, "y": 30, "w": 198, "h": 66 }, // where the crop sits in the atlas PNG — packer output
  "rotated":          false,
  "trimmed":          false,                                   // unlike clothing: no shared canvas to trim against
  "spriteSourceSize": { "x": 0, "y": 0, "w": 198, "h": 66 },    // == sourceSize here since trimmed is false
  "sourceSize":       { "w": 198, "h": 66 },                    // this piece's own natural pixel size — varies per item, no fixed canvas
  "points": [                                                   // ground-footprint polygon — see below, NOT decorative
    { "x": 6, "y": 62 }, { "x": 195, "y": 42 }, { "x": 181, "y": 64 }, { "x": 18, "y": 45 }
  ]
}
```

## `points` is load-bearing, not decorative

`FurnitureView.computePoints()` (`game-core/src/modules/furniture/FurnitureView.ts:102-122`)
reads `points` — a polygon in the frame's own local pixel coordinates (origin
at the frame's top-left, `(0,0)`) — and uses the transformed result for:

- **collision detection**: `HouseView.checkCollision()` tests this polygon
  against walls and other blocking furniture, not the sprite's rectangular
  bounding box;
- **isometric z-order** (`HouseView.getDepthAtPointClip()` reasoning applies
  the same way to furniture's own depth sort);
- **`getGroundCenter()`**, used for placement snapping.

If `points` is missing, `FurnitureView` silently falls back to a rectangular
bounding-box footprint — correct for a simple box, wrong for anything with a
non-rectangular ground contact (a bench's legs vs. its backrest, as in the
example above). Every orientation frame that's meant to be collidable/
ground-anchored should define its own `points`.

## Placeability (`items.sub_type`)

Only items with `sub_type = "PIECE"` can be placed by a player from their
inventory (`FurnitureStateService.place()`, game-server-java — rejects
anything else). `FLOOR`/`WALL`/`WALLPAPER` are room-*shape* concerns, not
player-owned instances, and aren't part of this contract at all.

## Catalog step (data, not code)

Assets existing under `public/furnitures/` don't make an item purchasable by
themselves — someone still has to create the catalog row. Via the existing
admin `Items`/`Shops` screens (generic, no furniture-specific code needed):
an item with `itemType=FURNITURE`, `subType=PIECE`, `spriteKey="jardin"`,
`spritePath="banc"`, added to a shop with a price.
