import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DashboardStats, TimeSeries, TopItem, TopUser } from '../models/models';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/stats`;

  dashboard(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.base}/dashboard`);
  }

  timeSeries(metric: string, from: string, to: string, granularity = 'day'): Observable<TimeSeries> {
    const params = new HttpParams()
      .set('metric', metric)
      .set('from', from)
      .set('to', to)
      .set('granularity', granularity);
    return this.http.get<TimeSeries>(`${this.base}/series`, { params });
  }

  topItems(limit = 10): Observable<TopItem[]> {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const params = new HttpParams().set('limit', limit).set('from', from).set('to', to);
    return this.http.get<TopItem[]>(`${this.base}/top-items`, { params });
  }

  topUsers(limit = 10): Observable<TopUser[]> {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const params = new HttpParams().set('limit', limit).set('from', from).set('to', to);
    return this.http.get<TopUser[]>(`${this.base}/top-users`, { params });
  }
}
