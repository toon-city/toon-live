import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUser, BalanceUpdateRequest, BanRequest, Page, RankUpdateRequest } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/users`;

  list(search?: string, banned?: boolean, page = 0): Observable<Page<AdminUser>> {
    let params = new HttpParams().set('page', page);
    if (search)             params = params.set('search', search);
    if (banned !== undefined) params = params.set('banned', banned);
    return this.http.get<Page<AdminUser>>(this.base, { params });
  }

  get(id: string): Observable<AdminUser> {
    return this.http.get<AdminUser>(`${this.base}/${id}`);
  }

  ban(id: string, req: BanRequest): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.base}/${id}/ban`, req);
  }

  unban(id: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.base}/${id}/unban`, {});
  }

  updateRank(id: string, req: RankUpdateRequest): Observable<AdminUser> {
    return this.http.put<AdminUser>(`${this.base}/${id}/rank`, req);
  }

  updateBalance(id: string, req: BalanceUpdateRequest): Observable<AdminUser> {
    return this.http.put<AdminUser>(`${this.base}/${id}/balance`, req);
  }
}
