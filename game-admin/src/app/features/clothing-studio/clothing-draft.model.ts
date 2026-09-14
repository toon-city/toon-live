/**
 * Shared types for the clothing-studio tool.
 *
 * Mirrors the avatar's own contract: fixed 80x120 canvas (matches
 * game-core/assets/toon/toon.json — the body's own frames), only the 8
 * bitmask directions with artwork (see the diagram at the top of
 * game-core/src/game/avatar/Avatar.ts).
 */

export const AVATAR_CANVAS_W = 80;
export const AVATAR_CANVAS_H = 120;

export type Direction = 1 | 2 | 4 | 5 | 6 | 8 | 9 | 10;

export const VALID_DIRECTIONS: readonly Direction[] = [1, 2, 4, 5, 6, 8, 9, 10];

export const DIRECTION_LABELS: Record<Direction, string> = {
  1: 'Bas',
  2: 'Haut',
  4: 'Droite',
  5: 'Bas-droite',
  6: 'Haut-droite',
  8: 'Gauche',
  9: 'Bas-gauche',
  10: 'Haut-gauche',
};

/** One direction's raw source image, positioned/scaled by the admin against the reference avatar. */
export interface DirectionPlacement {
  image: HTMLImageElement;
  /** Top-left of the (scaled) image on the 80x120 canvas. */
  x: number;
  y: number;
  /** Uniform scale applied to the image's natural size. */
  scale: number;
}

/**
 * One or more frames per direction. Index 0 is the only frame a static
 * item (hair, hat, face, tshirt, or a non-animated pant like a skirt) ever
 * has — the array shape is shared by every category so the same editor UI
 * and builder pipeline work for both; a category doesn't declare up front
 * whether it "is" animated, an item just has however many frames it has.
 * See game-assets/public/clothes/README.md's "Animated bottoms" section.
 */
export type PlacementsByDirection = Partial<Record<Direction, DirectionPlacement[]>>;

/** TexturePacker-contract frame entry — see game-assets/public/clothes/README.md. */
export interface ClotheFrameEntry {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: true;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface ClotheSpritesheetJson {
  frames: Record<string, ClotheFrameEntry>;
  meta: {
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
  };
}

export interface BuiltClotheAsset {
  atlasCanvas: HTMLCanvasElement;
  json: ClotheSpritesheetJson;
}
