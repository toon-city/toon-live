import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { Application } from 'pixi.js';
import { Avatar, BaseTextureLoader, AssetBaseUrl } from 'game-avatar';
import { environment } from '../../../../environments/environment';
import { AVATAR_CANVAS_W, AVATAR_CANVAS_H, Direction } from '../clothing-draft.model';

const ZOOM = 4;

/**
 * A small standalone PixiJS canvas hosting exactly one real `Avatar` — no
 * GameCore (no house/camera/input needed for a preview). Used in two roles
 * by clothing-studio:
 *  - Reference/onion-skin overlay in the direction editor (bare body, low
 *    opacity, fixed to the direction being edited).
 *  - The WYSIWYG dressed preview (equip() called with the in-progress
 *    item's draft, injected into Pixi's Cache by
 *    ClothingPreviewCacheService before this component sees it — from this
 *    component's point of view it's just a normal changeClothing() call).
 *
 * Mirrors game-web's GameCanvasComponent bootstrap pattern (canvas +
 * app.init() in ngAfterViewInit) minus everything house/room-related.
 */
@Component({
  selector: 'app-avatar-preview',
  standalone: true,
  template: `<canvas #canvas class="avatar-canvas"></canvas>`,
  styles: [`
    .avatar-canvas { display: block; }
  `],
})
export class AvatarPreviewComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() direction: Direction = 1;
  @Input() opacity = 1;
  @Input() walking = false;
  @Input() showSocle = true;

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private app: Application | null = null;
  private avatar: Avatar | null = null;
  private ready = false;

  async ngAfterViewInit(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      canvas: this.canvasRef.nativeElement,
      width: AVATAR_CANVAS_W * ZOOM,
      height: AVATAR_CANVAS_H * ZOOM,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio ?? 1,
      autoDensity: true,
    });

    // Idempotent: safe even if another AvatarPreviewComponent instance (or
    // any other GameCore-based screen) already set/loaded these.
    if (environment.assetsUrl) AssetBaseUrl.setDynamic(environment.assetsUrl);
    await BaseTextureLoader.getInstance().load();

    this.avatar = new Avatar(this.app, { showSocle: this.showSocle, direction: this.direction });
    this.avatar.scale.set(ZOOM);
    this.app.stage.addChild(this.avatar);

    this.ready = true;
    this.applyInputs();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.ready) this.applyInputs();
  }

  private applyInputs(): void {
    if (!this.avatar) return;
    this.avatar.changeDirection(this.direction);
    this.avatar.alpha = this.opacity;
    if (this.walking) this.avatar.walk();
    else this.avatar.stopWalk();
  }

  /** Equip (or, with no id, unequip) one category on this preview avatar. */
  equip(category: string, id?: string): void {
    this.avatar?.changeClothing(category, id);
  }

  setSkinColor(color: number): void {
    this.avatar?.setSkinColor(color);
  }

  ngOnDestroy(): void {
    this.app?.ticker.stop();
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.avatar = null;
  }
}
