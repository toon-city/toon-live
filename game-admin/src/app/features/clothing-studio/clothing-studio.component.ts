import { Component, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { MessageModule } from 'primeng/message';
import { DirectionEditorComponent } from './direction-editor/direction-editor.component';
import { AvatarPreviewComponent } from './avatar-preview/avatar-preview.component';
import { FrameGridComponent, GridCellSelection } from './frame-grid/frame-grid.component';
import { ClothingAssetBuilderService } from './services/clothing-asset-builder.service';
import { ClothingPreviewCacheService } from './services/clothing-preview-cache.service';
import { ClothingPublishService } from './services/clothing-publish.service';
import {
  VALID_DIRECTIONS,
  DIRECTION_LABELS,
  AVATAR_CANVAS_W,
  AVATAR_CANVAS_H,
  Direction,
  DirectionPlacement,
  PlacementsByDirection,
  BuiltClotheAsset,
} from './clothing-draft.model';

interface CategoryOption {
  value: string;
  label: string;
  /** Admin catalogue (features/items) subType this category maps to — see
   *  game-api ItemSubType.java and RoomStateService.buildClothingMap(): the
   *  clothing map key IS the category, so this only drives the post-publish
   *  guidance text, not the upload itself. */
  subType: string;
  /**
   * Can this category's items have more than one frame per direction
   * (a walk-cycle animation, or a non-animated bottom authored the same
   * way with just one frame — see game-assets/public/clothes/README.md's
   * "Animated bottoms" section)? Only `pant`'s runtime (`AnimatedClothe`)
   * reads more than frame 0 today — every other category still uses the
   * static `Clothe`, so their editor never offers a second frame: nothing
   * downstream would ever read it, and the name pattern for those
   * categories collapses every frameIndex to the same file name, which
   * would silently overwrite frame 0 with frame 1's crop instead of
   * producing anything useful.
   */
  hasFrameAnimation: boolean;
}

const CATEGORIES: CategoryOption[] = [
  { value: 'hair',   label: 'Cheveux',        subType: 'HAIRSTYLE', hasFrameAnimation: false },
  { value: 'hat',    label: 'Chapeau',        subType: 'HAT', hasFrameAnimation: false },
  { value: 'face',   label: 'Visage (lunettes, masque)', subType: 'MAKEUP', hasFrameAnimation: false },
  { value: 'tshirt', label: 'Haut (torse)',   subType: 'TOP', hasFrameAnimation: false },
  { value: 'pant',   label: 'Pantalon',       subType: 'BOTTOM', hasFrameAnimation: true },
];

const PREVIEW_DEBOUNCE_MS = 150;

@Component({
  selector: 'app-clothing-studio',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    MessageModule,
    DirectionEditorComponent,
    AvatarPreviewComponent,
    FrameGridComponent,
  ],
  templateUrl: './clothing-studio.component.html',
  styleUrls: ['./clothing-studio.component.scss'],
})
export class ClothingStudioComponent {
  private readonly builder = inject(ClothingAssetBuilderService);
  private readonly previewCache = inject(ClothingPreviewCacheService);
  private readonly publisher = inject(ClothingPublishService);

  @ViewChild(AvatarPreviewComponent) previewAvatar?: AvatarPreviewComponent;

  readonly categories = CATEGORIES;
  readonly directions = VALID_DIRECTIONS;
  readonly directionLabels = DIRECTION_LABELS;

  category = signal<string>('tshirt');
  itemId = signal<string>('');
  placements = signal<PlacementsByDirection>({});
  activeDirection = signal<Direction>(1);
  activeFrameIndex = signal(0);
  previewDirection = signal<Direction>(1);
  previewWalking = signal(false);

  readonly activeFrame = computed<DirectionPlacement | null>(() => {
    const frames = this.placements()[this.activeDirection()];
    return frames?.[this.activeFrameIndex()] ?? null;
  });

  publishing = signal(false);
  publishResult = signal<{ ok: boolean; message: string } | null>(null);

  readonly placedDirectionsCount = computed(() => Object.keys(this.placements()).length);
  readonly canPublish = computed(() =>
    this.itemId().trim().length > 0 && this.placedDirectionsCount() > 0 && !this.publishing()
  );

  readonly currentSubType = computed(() =>
    this.categories.find(c => c.value === this.category())?.subType ?? ''
  );

  readonly categoryHasFrameAnimation = computed(() =>
    this.categories.find(c => c.value === this.category())?.hasFrameAnimation ?? false
  );

  private previewDebounceHandle: ReturnType<typeof setTimeout> | null = null;

  onCategoryChange(): void {
    this.clearDraftFromPreview();
    this.placements.set({});
    this.activeFrameIndex.set(0);
    this.publishResult.set(null);
    this.schedulePreviewRefresh();
  }

  onItemIdChange(): void {
    this.clearDraftFromPreview();
    this.publishResult.set(null);
    this.schedulePreviewRefresh();
  }

  selectCell({ direction, frameIndex }: GridCellSelection): void {
    this.activeDirection.set(direction);
    this.activeFrameIndex.set(frameIndex);
  }

  /** Grid's "+" (or a static category's one empty slot) — append a new centered frame and load it straight into the stage editor. */
  onAddFrame({ direction, file }: { direction: Direction; file: File }): void {
    const img = new Image();
    img.onload = () => {
      // Center a freshly-dropped image on the canvas by default — nudging
      // from there is faster than hunting for a starting position.
      const x = Math.round((AVATAR_CANVAS_W - img.naturalWidth) / 2);
      const y = Math.round((AVATAR_CANVAS_H - img.naturalHeight) / 2);
      const placement: DirectionPlacement = { image: img, x, y, scale: 1 };

      const frames = [...(this.placements()[direction] ?? []), placement];
      this.setFrames(direction, frames);
      this.activeDirection.set(direction);
      this.activeFrameIndex.set(frames.length - 1);
    };
    img.src = URL.createObjectURL(file);
  }

  /** The stage editor's drag/scale/wheel edits on whichever frame is currently active. */
  onActiveFrameChange(patch: DirectionPlacement): void {
    const direction = this.activeDirection();
    const frames = [...(this.placements()[direction] ?? [])];
    frames[this.activeFrameIndex()] = patch;
    this.setFrames(direction, frames);
  }

  onRemoveActiveFrame(): void {
    const direction = this.activeDirection();
    const frames = (this.placements()[direction] ?? []).filter((_, i) => i !== this.activeFrameIndex());
    this.setFrames(direction, frames);
    this.activeFrameIndex.set(Math.min(this.activeFrameIndex(), Math.max(0, frames.length - 1)));
  }

  /** Empty array removes the direction entirely (same as the old single-placement "null" case). */
  private setFrames(direction: Direction, frames: DirectionPlacement[]): void {
    this.placements.update(current => {
      const next = { ...current };
      if (frames.length > 0) next[direction] = frames;
      else delete next[direction];
      return next;
    });
    this.schedulePreviewRefresh();
  }

  private namePattern(): (direction: Direction, frameIndex: number) => string {
    const id = this.itemId().trim();
    if (this.category() === 'tshirt') return (d: Direction) => `${id}_bd_${d}.png`;
    if (this.categoryHasFrameAnimation()) return (d: Direction, n: number) => `${id}_${d}_${n}.png`;
    return (d: Direction) => `${id}_${d}.png`;
  }

  private buildDraft(): BuiltClotheAsset | null {
    const id = this.itemId().trim();
    if (!id) return null;
    return this.builder.build(id, this.placements(), this.namePattern());
  }

  /** Debounced: rebuild the atlas/JSON and inject it into the preview avatar. */
  private schedulePreviewRefresh(): void {
    if (this.previewDebounceHandle) clearTimeout(this.previewDebounceHandle);
    this.previewDebounceHandle = setTimeout(() => this.refreshPreview(), PREVIEW_DEBOUNCE_MS);
  }

  private async refreshPreview(): Promise<void> {
    const id = this.itemId().trim();
    const category = this.category();
    const draft = this.buildDraft();

    if (!draft || !id) {
      this.previewAvatar?.equip(category);
      return;
    }

    await this.previewCache.injectDraft(category, id, draft);
    this.previewAvatar?.equip(category, id);
  }

  private clearDraftFromPreview(): void {
    const id = this.itemId().trim();
    if (id) this.previewCache.clearDraft(this.category(), id);
  }

  cycleDirectionPreview(direction: Direction): void {
    this.previewDirection.set(direction);
  }

  toggleWalking(): void {
    this.previewWalking.update(w => !w);
  }

  async publish(): Promise<void> {
    const draft = this.buildDraft();
    const id = this.itemId().trim();
    if (!draft || !id) return;

    this.publishing.set(true);
    this.publishResult.set(null);
    try {
      await this.publisher.publish(this.category(), id, draft);
      this.publishResult.set({
        ok: true,
        message:
          `Publié : clothes/${this.category()}/${id}.png + .json — ` +
          `pas encore équipable. Va dans Items, crée/édite un item ` +
          `itemType=CLOTHING, subType=${this.currentSubType()}, ` +
          `spriteKey=${this.category()}, spritePath=${id}.`,
      });
    } catch (e) {
      this.publishResult.set({ ok: false, message: `Échec de la publication : ${(e as Error).message ?? e}` });
    } finally {
      this.publishing.set(false);
    }
  }
}
