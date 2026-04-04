import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminRoom, AdminRoomUpdate, Page } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AdminRoomsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/rooms`;

  list(search?: string, page = 0): Observable<Page<AdminRoom>> {
    let params = new HttpParams().set('page', page);
    if (search) params = params.set('search', search);
    return this.http.get<Page<AdminRoom>>(this.base, { params });
  }

  get(id: number): Observable<AdminRoom> {
    return this.http.get<AdminRoom>(`${this.base}/${id}`);
  }

  update(id: number, req: AdminRoomUpdate): Observable<AdminRoom> {
    return this.http.put<AdminRoom>(`${this.base}/${id}`, req);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  lock(id: number): Observable<AdminRoom> {
    return this.http.post<AdminRoom>(`${this.base}/${id}/lock`, {});
  }

  unlock(id: number): Observable<AdminRoom> {
    return this.http.post<AdminRoom>(`${this.base}/${id}/unlock`, {});
  }

  kickAll(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/kick`, {});
  }
}
