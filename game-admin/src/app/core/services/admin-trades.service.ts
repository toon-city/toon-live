import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page, TradeOfferInfo } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AdminTradesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/trades`;

  list(status?: string, username?: string, page = 0): Observable<Page<TradeOfferInfo>> {
    let params = new HttpParams().set('page', page);
    if (status)   params = params.set('status', status);
    if (username) params = params.set('username', username);
    return this.http.get<Page<TradeOfferInfo>>(this.base, { params });
  }

  cancel(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/cancel`, {});
  }
}
