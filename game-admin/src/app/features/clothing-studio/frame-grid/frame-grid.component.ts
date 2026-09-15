import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AVATAR_CANVAS_W,
  Direction,
  DirectionPlacement,
  PlacementsByDirection,
} from '../clothing-draft.model';

const THUMB_W = 44;
const THUMB_H = 66;
const THUMB_ZOOM = THUMB_W / AVATAR_CANVAS_W; // matches AVATAR_CANVAS_H/THUMB_H too — canvas is a fixed 80:120 ratio

export interface GridCellSelection {
  direction: Direction;
  frameIndex: number;
}

/**
 * The whole animation set at a glance: one row per direction, one thumbnail
 * cell per frame in that direction, in walk-cycle order. Replaces the old
 * two-step nav (a direction-chips row above, then a numbered frame-strip
 * *inside* the direction editor for whichever direction was picked) — you
 * couldn't see direction 1's 8 frames next to direction 5's 3 frames without
 * clicking back and forth. This is the "grid" — click any cell to load it
 * into the single big stage editor below; click a row's trailing "+" (or its
 * one empty slot, for a non-animated category) to add a frame there.
 */
@Component({
  selector: 'app-frame-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './frame-grid.component.html',
  styleUrls: ['./frame-grid.component.scss'],
})
export class FrameGridComponent {
  @Input({ required: true }) directions!: readonly Direction[];
  @Input({ required: true }) directionLabels!: Record<Direction, string>;
  @Input({ required: true }) placements!: PlacementsByDirection;
  @Input() hasFrameAnimation = false;
  @Input() activeDirection: Direction | null = null;
  @Input() activeFrameIndex = 0;

  @Output() select = new EventEmitter<GridCellSelection>();
  @Output() addFrame = new EventEmitter<{ direction: Direction; file: File }>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly thumbW = THUMB_W;
  readonly thumbH = THUMB_H;

  private pendingDirection: Direction | null = null;

  framesFor(direction: Direction): DirectionPlacement[] {
    return this.placements[direction] ?? [];
  }

  /** A row's "add" slot only shows once it already has a frame AND the category allows more than one (an animation) — a fresh empty row is itself the thing to click for a static category's single slot. */
  showAddChip(direction: Direction): boolean {
    return this.hasFrameAnimation && this.framesFor(direction).length > 0;
  }

  isActive(direction: Direction, index: number): boolean {
    return this.activeDirection === direction && this.activeFrameIndex === index;
  }

  selectFrame(direction: Direction, index: number): void {
    this.select.emit({ direction, frameIndex: index });
  }

  /** Click on an empty row (no frames yet) or the trailing "+" — either way, prompt for a file for that direction's next slot. */
  promptAdd(direction: Direction): void {
    this.pendingDirection = direction;
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const direction = this.pendingDirection;
    this.pendingDirection = null;
    input.value = '';
    if (!file || direction === null) return;
    this.addFrame.emit({ direction, file });
  }

  /** Same placement -> CSS transform math as the main stage editor, just at thumbnail scale. */
  thumbStyle(frame: DirectionPlacement): Record<string, string> {
    return {
      left: `${frame.x * THUMB_ZOOM}px`,
      top: `${frame.y * THUMB_ZOOM}px`,
      width: `${frame.image.naturalWidth * frame.scale * THUMB_ZOOM}px`,
      height: `${frame.image.naturalHeight * frame.scale * THUMB_ZOOM}px`,
    };
  }
}
