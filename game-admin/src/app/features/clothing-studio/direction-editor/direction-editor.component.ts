import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
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
 */
@Component({
  selector: 'app-direction-editor',
  standalone: true,
  imports: [CommonModule, AvatarPreviewComponent],
  templateUrl: './direction-editor.component.html',
  styleUrls: ['./direction-editor.component.scss'],
})
export class DirectionEditorComponent {
  @Input({ required: true }) direction!: Direction;
  @Input() placement: DirectionPlacement | null = null;
  @Output() placementChange = new EventEmitter<DirectionPlacement | null>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly zoom = ZOOM;
  readonly canvasW = AVATAR_CANVAS_W;
  readonly canvasH = AVATAR_CANVAS_H;

  private dragging = false;
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private dragStartX = 0;
  private dragStartY = 0;

  get label(): string {
    return DIRECTION_LABELS[this.direction];
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      // Center a freshly-dropped image on the canvas by default — nudging
      // from there is faster than hunting for a starting position.
      const x = Math.round((this.canvasW - img.naturalWidth) / 2);
      const y = Math.round((this.canvasH - img.naturalHeight) / 2);
      this.placementChange.emit({ image: img, x, y, scale: 1 });
    };
    img.src = URL.createObjectURL(file);

    input.value = '';
  }

  removeImage(): void {
    this.placementChange.emit(null);
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.placement) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.dragStartClientX = event.clientX;
    this.dragStartClientY = event.clientY;
    this.dragStartX = this.placement.x;
    this.dragStartY = this.placement.y;
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging || !this.placement) return;
    const dx = (event.clientX - this.dragStartClientX) / this.zoom;
    const dy = (event.clientY - this.dragStartClientY) / this.zoom;
    this.placementChange.emit({
      ...this.placement,
      x: this.dragStartX + dx,
      y: this.dragStartY + dy,
    });
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  onWheel(event: WheelEvent): void {
    if (!this.placement) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.05 : -0.05;
    const scale = Math.max(0.1, Math.min(4, this.placement.scale + delta));
    this.placementChange.emit({ ...this.placement, scale });
  }

  onScaleSlider(value: number): void {
    if (!this.placement) return;
    this.placementChange.emit({ ...this.placement, scale: value });
  }

  /** CSS transform placing the admin's image over the canvas at display zoom. */
  imageStyle(): Record<string, string> {
    if (!this.placement) return {};
    const w = this.placement.image.naturalWidth * this.placement.scale * this.zoom;
    const h = this.placement.image.naturalHeight * this.placement.scale * this.zoom;
    return {
      left: `${this.placement.x * this.zoom}px`,
      top: `${this.placement.y * this.zoom}px`,
      width: `${w}px`,
      height: `${h}px`,
    };
  }
}
