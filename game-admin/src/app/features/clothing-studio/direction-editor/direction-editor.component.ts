import { Component, Input, Output, EventEmitter } from '@angular/core';
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
 * Framing stage for ONE frame: a real, semi-transparent reference `Avatar`
 * (the "cadré comme les pros" onion-skin overlay) with the admin's raw
 * source image positioned/scaled on top via drag + wheel-zoom. All
 * coordinates the admin sees are just CSS transforms at display zoom; what
 * gets emitted (`DirectionPlacement.x/y/scale`) is always in the underlying
 * 80x120 canvas space, matching every other frame in the codebase.
 *
 * Which (direction, frame index) is being edited here is decided one level
 * up by `<app-frame-grid>` — this component only ever sees one frame at a
 * time and doesn't know about the others; uploading, adding, and removing
 * frames all happen through the grid instead.
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
  @Input() frame: DirectionPlacement | null = null;
  @Output() frameChange = new EventEmitter<DirectionPlacement>();
  @Output() remove = new EventEmitter<void>();

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

  private update(patch: Partial<DirectionPlacement>): void {
    if (!this.frame) return;
    this.frameChange.emit({ ...this.frame, ...patch });
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.frame) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.dragStartClientX = event.clientX;
    this.dragStartClientY = event.clientY;
    this.dragStartX = this.frame.x;
    this.dragStartY = this.frame.y;
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging || !this.frame) return;
    const dx = (event.clientX - this.dragStartClientX) / this.zoom;
    const dy = (event.clientY - this.dragStartClientY) / this.zoom;
    this.update({ x: this.dragStartX + dx, y: this.dragStartY + dy });
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  onWheel(event: WheelEvent): void {
    if (!this.frame) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.05 : -0.05;
    const scale = Math.max(0.1, Math.min(4, this.frame.scale + delta));
    this.update({ scale });
  }

  onScaleSlider(value: number): void {
    if (!this.frame) return;
    this.update({ scale: value });
  }

  /** CSS transform placing the admin's image over the canvas at display zoom. */
  imageStyle(): Record<string, string> {
    const frame = this.frame;
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
