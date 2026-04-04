import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminItemRequest, ItemInfo, Page } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AdminItemsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/items`;

  list(search?: string, type?: string, page = 0): Observable<Page<ItemInfo>> {
    let params = new HttpParams().set('page', page);
    if (search) params = params.set('search', search);
    if (type)   params = params.set('type', type);
    return this.http.get<Page<ItemInfo>>(this.base, { params });
  }

  get(id: number): Observable<ItemInfo> {
    return this.http.get<ItemInfo>(`${this.base}/${id}`);
  }

  create(req: AdminItemRequest): Observable<ItemInfo> {
    return this.http.post<ItemInfo>(this.base, req);
  }

  update(id: number, req: AdminItemRequest): Observable<ItemInfo> {
    return this.http.put<ItemInfo>(`${this.base}/${id}`, req);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
