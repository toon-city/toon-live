import { Component, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { MessageModule } from 'primeng/message';
import { DirectionEditorComponent } from './direction-editor/direction-editor.component';
import { AvatarPreviewComponent } from './avatar-preview/avatar-preview.component';
import { ClothingAssetBuilderService } from './services/clothing-asset-builder.service';
import { ClothingPreviewCacheService } from './services/clothing-preview-cache.service';
import { ClothingPublishService } from './services/clothing-publish.service';
import {
  VALID_DIRECTIONS,
  DIRECTION_LABELS,
  Direction,
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
}

const CATEGORIES: CategoryOption[] = [
  { value: 'hair',   label: 'Cheveux',        subType: 'HAIRSTYLE' },
  { value: 'hat',    label: 'Chapeau',        subType: 'HAT' },
  { value: 'face',   label: 'Visage (lunettes, masque)', subType: 'MAKEUP' },
  { value: 'tshirt', label: 'Haut (torse)',   subType: 'TOP' },
  { value: 'pant',   label: 'Pantalon',       subType: 'BOTTOM' },
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
  previewDirection = signal<Direction>(1);
  previewWalking = signal(false);

  publishing = signal(false);
  publishResult = signal<{ ok: boolean; message: string } | null>(null);

  readonly placedDirectionsCount = computed(() => Object.keys(this.placements()).length);
  readonly canPublish = computed(() =>
    this.itemId().trim().length > 0 && this.placedDirectionsCount() > 0 && !this.publishing()
  );

  readonly currentSubType = computed(() =>
    this.categories.find(c => c.value === this.category())?.subType ?? ''
  );

  private previewDebounceHandle: ReturnType<typeof setTimeout> | null = null;

  onCategoryChange(): void {
    this.clearDraftFromPreview();
    this.placements.set({});
    this.publishResult.set(null);
    this.schedulePreviewRefresh();
  }

  onItemIdChange(): void {
    this.clearDraftFromPreview();
    this.publishResult.set(null);
    this.schedulePreviewRefresh();
  }

  onPlacementChange(direction: Direction, placement: PlacementsByDirection[Direction] | null): void {
    this.placements.update(current => {
      const next = { ...current };
      if (placement) next[direction] = placement;
      else delete next[direction];
      return next;
    });
    this.schedulePreviewRefresh();
  }

  selectDirection(direction: Direction): void {
    this.activeDirection.set(direction);
  }

  private namePattern(): (direction: Direction) => string {
    const id = this.itemId().trim();
    return this.category() === 'tshirt'
      ? (d: Direction) => `${id}_bd_${d}.png`
      : (d: Direction) => `${id}_${d}.png`;
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
