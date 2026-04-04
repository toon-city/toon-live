import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { KredsPackage, KredsPackageRequest, Page } from '../models/models';

@Injectable({ providedIn: 'root' })
export class KredsService {
  private readonly http = inject(HttpClient);

  listActive(): Observable<KredsPackage[]> {
    return this.http.get<KredsPackage[]>(`${environment.apiUrl}/kreds/packages`);
  }

  listAll(page = 0): Observable<Page<KredsPackage>> {
    return this.http.get<Page<KredsPackage>>(`${environment.apiUrl}/admin/kreds/packages`,
      { params: new HttpParams().set('page', page) });
  }

  create(req: KredsPackageRequest): Observable<KredsPackage> {
    return this.http.post<KredsPackage>(`${environment.apiUrl}/admin/kreds/packages`, req);
  }

  update(id: number, req: KredsPackageRequest): Observable<KredsPackage> {
    return this.http.put<KredsPackage>(`${environment.apiUrl}/admin/kreds/packages/${id}`, req);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/admin/kreds/packages/${id}`);
  }
}
