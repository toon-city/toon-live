import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatMessage, Page } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AdminChatService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/chat`;

  list(roomId?: number, username?: string, page = 0): Observable<Page<ChatMessage>> {
    let params = new HttpParams().set('page', page);
    if (roomId)   params = params.set('roomId', roomId);
    if (username) params = params.set('username', username);
    return this.http.get<Page<ChatMessage>>(this.base, { params });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
