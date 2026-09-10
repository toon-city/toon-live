import { Injectable } from '@angular/core';
import { Cache, Spritesheet, Texture, SpritesheetData } from 'pixi.js';
import { AssetBaseUrl } from 'game-core';
import { BuiltClotheAsset } from '../clothing-draft.model';

/**
 * Injects an in-progress (not-yet-published) clothing draft straight into
 * PixiJS's own asset Cache, so the WYSIWYG preview avatar can wear it with
 * zero network round-trip and zero special-casing in game-core: `Clothe`'s
 * constructor already does `if (Assets.cache.has(fileURI)) { ... }` before
 * ever hitting the network (see Clothe.ts) — `Assets.cache` IS `Cache`
 * (same singleton, verified against pixi.js/lib/assets/Assets.js), so
 * pre-populating it here is indistinguishable, from Clothe's point of
 * view, from the real asset having already loaded.
 *
 * `Cache.set(fileURI, spritesheet)` runs the same CacheParser the real
 * network loader uses (pixi.js/lib/spritesheet/spritesheetAsset.js),
 * registering every named frame texture individually — that's what makes
 * `Texture.from('id_1.png')` resolve inside Clothe.refreshTexture().
 */
@Injectable({ providedIn: 'root' })
export class ClothingPreviewCacheService {
  private draftKeys = new Set<string>();

  /** Must match Clothe.fileURI exactly, or Avatar.changeClothing() will look in the wrong place. */
  private fileURI(category: string, id: string): string {
    return AssetBaseUrl.resolve(`clothes/${category}/${id}.json`);
  }

  async injectDraft(category: string, id: string, asset: BuiltClotheAsset): Promise<void> {
    const fileURI = this.fileURI(category, id);
    const baseTexture = Texture.from(asset.atlasCanvas);
    // ClotheSpritesheetJson is a stricter, purpose-built shape than Pixi's
    // own SpritesheetData (every field it needs is required here, Pixi
    // makes most optional) — structurally compatible, cast is safe.
    const sheet = new Spritesheet(baseTexture, asset.json as unknown as SpritesheetData);
    await sheet.parse();
    Cache.set(fileURI, sheet);
    this.draftKeys.add(fileURI);
  }

  /** Call when leaving the tool or switching item id — avoids a stale draft
   *  under an id that later collides with a real published item. */
  clearDraft(category: string, id: string): void {
    const fileURI = this.fileURI(category, id);
    if (Cache.has(fileURI)) Cache.remove(fileURI);
    this.draftKeys.delete(fileURI);
  }

  clearAllDrafts(): void {
    for (const key of this.draftKeys) {
      if (Cache.has(key)) Cache.remove(key);
    }
    this.draftKeys.clear();
  }
}
