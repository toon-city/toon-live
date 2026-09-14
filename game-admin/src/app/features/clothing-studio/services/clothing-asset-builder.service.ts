import { Injectable } from '@angular/core';
import {
  AVATAR_CANVAS_W,
  AVATAR_CANVAS_H,
  Direction,
  PlacementsByDirection,
  ClotheFrameEntry,
  ClotheSpritesheetJson,
  BuiltClotheAsset,
} from '../clothing-draft.model';

/** Alpha values at/below this are treated as fully transparent when trimming. */
const ALPHA_THRESHOLD = 8;
/** Padding (px) between packed frames in the atlas, avoids texture bleeding. */
const ATLAS_PADDING = 2;

interface TrimmedFrame {
  direction: Direction;
  /** Index within this direction's own frame array — 0 for every static item. */
  frameIndex: number;
  crop: HTMLCanvasElement;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
}

/**
 * Pure logic: per-direction placements (see DirectionPlacement) → a
 * contract-compliant clothing spritesheet (atlas PNG canvas + JSON).
 *
 * No Angular UI concerns here — kept framework-agnostic so it's easy to
 * unit test and, later, reuse for a differently-shaped contract (furniture
 * uses trimmed:false + variable sourceSize + a `points` polygon — see
 * game-assets/public/clothes/README.md and the furniture JSONs under
 * game-assets/public/furnitures/ — so the canvas size and contract fields
 * are parameters here, not hardcoded deep in the packer).
 */
@Injectable({ providedIn: 'root' })
export class ClothingAssetBuilderService {
  /**
   * Render one direction's placement onto the full 80x120 canvas and find
   * the tight bounding box of non-transparent pixels — this is the "trim"
   * step a real TexturePacker export does automatically. Returns null if
   * nothing ends up visible (fully off-canvas placement, or a fully
   * transparent source image).
   */
  private trimFrame(direction: Direction, frameIndex: number, placement: import('../clothing-draft.model').DirectionPlacement): TrimmedFrame | null {
    const full = document.createElement('canvas');
    full.width = AVATAR_CANVAS_W;
    full.height = AVATAR_CANVAS_H;
    const ctx = full.getContext('2d')!;

    const dw = placement.image.naturalWidth * placement.scale;
    const dh = placement.image.naturalHeight * placement.scale;
    ctx.drawImage(placement.image, placement.x, placement.y, dw, dh);

    const { data } = ctx.getImageData(0, 0, AVATAR_CANVAS_W, AVATAR_CANVAS_H);
    let minX = AVATAR_CANVAS_W, minY = AVATAR_CANVAS_H, maxX = -1, maxY = -1;
    for (let y = 0; y < AVATAR_CANVAS_H; y++) {
      for (let x = 0; x < AVATAR_CANVAS_W; x++) {
        const alpha = data[(y * AVATAR_CANVAS_W + x) * 4 + 3];
        if (alpha > ALPHA_THRESHOLD) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const crop = document.createElement('canvas');
    crop.width = w;
    crop.height = h;
    crop.getContext('2d')!.drawImage(full, minX, minY, w, h, 0, 0, w, h);

    return {
      direction,
      frameIndex,
      crop,
      spriteSourceSize: { x: minX, y: minY, w, h },
    };
  }

  /**
   * Grid-pack the trimmed frames into one atlas. At most 8 frames per item
   * (one per direction) — a full MaxRects packer is unnecessary complexity
   * for that count; a fixed grid sized to the largest frame is simple,
   * predictable, and matches the regular-grid layout the migrated
   * hand-authored files already use (see hair7.json).
   */
  private packFrames(trimmed: TrimmedFrame[]): { atlas: HTMLCanvasElement; frames: (TrimmedFrame & { atlasRect: { x: number; y: number } })[] } {
    const cellW = Math.max(...trimmed.map(t => t.crop.width)) + ATLAS_PADDING;
    const cellH = Math.max(...trimmed.map(t => t.crop.height)) + ATLAS_PADDING;
    const cols = Math.ceil(Math.sqrt(trimmed.length));
    const rows = Math.ceil(trimmed.length / cols);

    const atlas = document.createElement('canvas');
    atlas.width = cols * cellW;
    atlas.height = rows * cellH;
    const ctx = atlas.getContext('2d')!;

    const frames = trimmed.map((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const atlasRect = { x: col * cellW, y: row * cellH };
      ctx.drawImage(t.crop, atlasRect.x, atlasRect.y);
      return { ...t, atlasRect };
    });

    return { atlas, frames };
  }

  /**
   * Build the final spritesheet from every placed direction.
   *
   * @param id       clothing item id (used in frame names and meta.image)
   * @param namePattern  frame-name builder. For a static category (hair/hat/
   *                     face/tshirt) this ignores `frameIndex` and returns
   *                     `${id}_${d}.png` (or `${id}_bd_${d}.png` for
   *                     tshirt's torso layer — see Tshirt.ts) — those
   *                     categories' runtime (`Clothe`) only ever reads frame
   *                     0, so their editor UI never offers a second frame to
   *                     begin with (see CATEGORIES.hasFrameAnimation in
   *                     clothing-studio.component.ts). An animated category
   *                     (pant) returns `${id}_${d}_${frameIndex}.png` —
   *                     `AnimatedClothe`'s contract, see game-assets/public/
   *                     clothes/README.md's "Animated bottoms" section.
   */
  build(id: string, placements: PlacementsByDirection, namePattern: (direction: Direction, frameIndex: number) => string): BuiltClotheAsset | null {
    const trimmed = (Object.entries(placements) as [string, import('../clothing-draft.model').DirectionPlacement[]][])
      .flatMap(([d, frames]) => frames.map((placement, frameIndex) =>
        this.trimFrame(Number(d) as Direction, frameIndex, placement)))
      .filter((f): f is TrimmedFrame => f !== null);

    if (trimmed.length === 0) return null;

    const { atlas, frames } = this.packFrames(trimmed);

    const jsonFrames: Record<string, ClotheFrameEntry> = {};
    for (const f of frames) {
      jsonFrames[namePattern(f.direction, f.frameIndex)] = {
        frame: { x: f.atlasRect.x, y: f.atlasRect.y, w: f.crop.width, h: f.crop.height },
        rotated: false,
        trimmed: true,
        spriteSourceSize: f.spriteSourceSize,
        sourceSize: { w: AVATAR_CANVAS_W, h: AVATAR_CANVAS_H },
      };
    }

    const json: ClotheSpritesheetJson = {
      frames: jsonFrames,
      meta: {
        version: '1.0',
        image: `${id}.png`,
        format: 'RGBA8888',
        size: { w: atlas.width, h: atlas.height },
        scale: '1',
      },
    };

    return { atlasCanvas: atlas, json };
  }
}
