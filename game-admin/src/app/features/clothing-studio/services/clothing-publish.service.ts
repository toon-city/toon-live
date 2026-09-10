import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BuiltClotheAsset } from '../clothing-draft.model';

/**
 * Publishes a built clothing asset to the existing, unmodified game-assets
 * upload endpoint (game-assets/src/server.ts POST /upload). No new backend
 * work: that endpoint already accepts multipart {path, file}, requires an
 * admin/mod JWT, is path-traversal-safe, and auto-creates destination
 * directories.
 *
 * Auth: the admin JWT is already attached to every outgoing HttpClient
 * request by the global authInterceptor (core/interceptors/auth.interceptor.ts,
 * unconditional on any request) — nothing extra to wire here.
 */
@Injectable({ providedIn: 'root' })
export class ClothingPublishService {
  private readonly http = inject(HttpClient);

  async publish(category: string, id: string, asset: BuiltClotheAsset): Promise<void> {
    const pngBlob = await this.canvasToBlob(asset.atlasCanvas);
    const jsonBlob = new Blob([JSON.stringify(asset.json, null, '\t')], { type: 'application/json' });

    await this.uploadOne(`clothes/${category}/${id}.png`, pngBlob, 'image/png');
    await this.uploadOne(`clothes/${category}/${id}.json`, jsonBlob, 'application/json');
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png');
    });
  }

  private async uploadOne(path: string, blob: Blob, mime: string): Promise<void> {
    const filename = path.split('/').pop()!;
    const form = new FormData();
    form.append('path', path);
    form.append('file', new File([blob], filename, { type: mime }));
    await firstValueFrom(this.http.post(`${environment.assetsUrl}/upload`, form));
  }
}
