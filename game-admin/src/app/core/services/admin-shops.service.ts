import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CollectionInfo, CollectionRequest, Page, ShopItem, ShopItemRequest } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AdminShopsService {
  private readonly http = inject(HttpClient);

  private shopBase(shopId: string) {
    return `${environment.apiUrl}/admin/shops/${shopId}`;
  }

  // ─── Shop Items ──────────────────────────────────────────────────────────────

  listItems(shopId: string, page = 0): Observable<Page<ShopItem>> {
    return this.http.get<Page<ShopItem>>(`${this.shopBase(shopId)}/items`,
      { params: new HttpParams().set('page', page) });
  }

  createItem(shopId: string, req: ShopItemRequest): Observable<ShopItem> {
    return this.http.post<ShopItem>(`${this.shopBase(shopId)}/items`, req);
  }

  updateItem(shopId: string, id: number, req: ShopItemRequest): Observable<ShopItem> {
    return this.http.put<ShopItem>(`${this.shopBase(shopId)}/items/${id}`, req);
  }

  deleteItem(shopId: string, id: number): Observable<void> {
    return this.http.delete<void>(`${this.shopBase(shopId)}/items/${id}`);
  }

  // ─── Collections ─────────────────────────────────────────────────────────────

  listCollections(shopId: string): Observable<CollectionInfo[]> {
    return this.http.get<CollectionInfo[]>(`${this.shopBase(shopId)}/collections`);
  }

  createCollection(shopId: string, req: CollectionRequest): Observable<CollectionInfo> {
    return this.http.post<CollectionInfo>(`${this.shopBase(shopId)}/collections`, req);
  }

  updateCollection(shopId: string, id: number, req: CollectionRequest): Observable<CollectionInfo> {
    return this.http.put<CollectionInfo>(`${this.shopBase(shopId)}/collections/${id}`, req);
  }

  deleteCollection(shopId: string, id: number): Observable<void> {
    return this.http.delete<void>(`${this.shopBase(shopId)}/collections/${id}`);
  }
}
