import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvatarPreviewComponent } from '../avatar-preview/avatar-preview.component';
import {
  AVATAR_CANVAS_W,
  AVATAR_CANVAS_H,
  Direction,
  DirectionPlacement,
  DIRECTION_LABELS,
} from '../clothing-draft.model';

const ZOOM = 4;

/**
 * Framing editor for ONE direction: a real, semi-transparent reference
 * `Avatar` (the "cadré comme les pros" onion-skin overlay) with the admin's
 * raw source image positioned/scaled on top via drag + wheel-zoom. All
 * coordinates the admin sees are just CSS transforms at display zoom; what
 * gets emitted (`DirectionPlacement.x/y/scale`) is always in the underlying
 * 80x120 canvas space, matching every other frame in the codebase.
 *
 * A direction can hold more than one frame (see `PlacementsByDirection`'s
 * class doc) — `selectedFrameIndex` picks which one drag/wheel/upload act
 * on, via the frame strip at the bottom. Every category gets frame 0's
 * upload/position controls the same as before; the "+" (add another frame)
 * and per-frame thumbnails only appear when `hasFrameAnimation` is true —
 * see clothing-studio.component.ts's CATEGORIES.
 */
@Component({
  selector: 'app-direction-editor',
  standalone: true,
  imports: [CommonModule, AvatarPreviewComponent],
  templateUrl: './direction-editor.component.html',
  styleUrls: ['./direction-editor.component.scss'],
})
export class DirectionEditorComponent implements OnChanges {
  @Input({ required: true }) direction!: Direction;
  @Input() frames: DirectionPlacement[] = [];
  @Input() hasFrameAnimation = false;
  @Output() framesChange = new EventEmitter<DirectionPlacement[]>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly zoom = ZOOM;
  readonly canvasW = AVATAR_CANVAS_W;
  readonly canvasH = AVATAR_CANVAS_H;

  selectedFrameIndex = 0;

  private dragging = false;
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  /** Set by the "+" button so the next file picked is appended, not swapped into the current slot. */
  private pendingAppend = false;

  get label(): string {
    return DIRECTION_LABELS[this.direction];
  }

  get activeFrame(): DirectionPlacement | null {
    return this.frames[this.selectedFrameIndex] ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Switching direction (or a fresh/emptied frame list) — the previously
    // selected index almost certainly doesn't apply to the new list.
    if (changes['direction'] || changes['frames']) {
      this.selectedFrameIndex = Math.min(this.selectedFrameIndex, Math.max(0, this.frames.length - 1));
    }
  }

  selectFrame(index: number): void {
    this.selectedFrameIndex = index;
  }

  addFrame(): void {
    this.pendingAppend = true;
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const append = this.pendingAppend;
    this.pendingAppend = false;

    const img = new Image();
    img.onload = () => {
      // Center a freshly-dropped image on the canvas by default — nudging
      // from there is faster than hunting for a starting position.
      const x = Math.round((this.canvasW - img.naturalWidth) / 2);
      const y = Math.round((this.canvasH - img.naturalHeight) / 2);
      const placement: DirectionPlacement = { image: img, x, y, scale: 1 };

      const next = [...this.frames];
      if (append) {
        next.push(placement);
        this.selectedFrameIndex = next.length - 1;
      } else {
        next[this.selectedFrameIndex] = placement;
      }
      this.framesChange.emit(next);
    };
    img.src = URL.createObjectURL(file);

    input.value = '';
  }

  removeImage(): void {
    const next = this.frames.filter((_, i) => i !== this.selectedFrameIndex);
    this.selectedFrameIndex = Math.min(this.selectedFrameIndex, Math.max(0, next.length - 1));
    this.framesChange.emit(next);
  }

  private updateActiveFrame(patch: Partial<DirectionPlacement>): void {
    if (!this.activeFrame) return;
    const next = [...this.frames];
    next[this.selectedFrameIndex] = { ...this.activeFrame, ...patch };
    this.framesChange.emit(next);
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.activeFrame) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.dragStartClientX = event.clientX;
    this.dragStartClientY = event.clientY;
    this.dragStartX = this.activeFrame.x;
    this.dragStartY = this.activeFrame.y;
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging || !this.activeFrame) return;
    const dx = (event.clientX - this.dragStartClientX) / this.zoom;
    const dy = (event.clientY - this.dragStartClientY) / this.zoom;
    this.updateActiveFrame({ x: this.dragStartX + dx, y: this.dragStartY + dy });
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  onWheel(event: WheelEvent): void {
    if (!this.activeFrame) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.05 : -0.05;
    const scale = Math.max(0.1, Math.min(4, this.activeFrame.scale + delta));
    this.updateActiveFrame({ scale });
  }

  onScaleSlider(value: number): void {
    if (!this.activeFrame) return;
    this.updateActiveFrame({ scale: value });
  }

  /** CSS transform placing the admin's image over the canvas at display zoom. */
  imageStyle(): Record<string, string> {
    const frame = this.activeFrame;
    if (!frame) return {};
    const w = frame.image.naturalWidth * frame.scale * this.zoom;
    const h = frame.image.naturalHeight * frame.scale * this.zoom;
    return {
      left: `${frame.x * this.zoom}px`,
      top: `${frame.y * this.zoom}px`,
      width: `${w}px`,
      height: `${h}px`,
    };
  }
}
