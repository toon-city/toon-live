import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminMetierRequest, MetierInfo } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AdminMetiersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/metiers`;

  list(): Observable<MetierInfo[]> {
    return this.http.get<MetierInfo[]>(this.base);
  }

  create(req: AdminMetierRequest): Observable<MetierInfo> {
    return this.http.post<MetierInfo>(this.base, req);
  }

  update(id: number, req: AdminMetierRequest): Observable<MetierInfo> {
    return this.http.put<MetierInfo>(`${this.base}/${id}`, req);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
