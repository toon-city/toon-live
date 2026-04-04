import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthResponse, CurrentUser, LoginRequest } from '../models/models';

const TOKEN_KEY = 'admin_token';
const USER_KEY  = 'admin_user';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly http   = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user    = signal<CurrentUser | null>(this.loadUser());
  readonly token   = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  login(req: LoginRequest) {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/token`, req).pipe(
      tap(res => {
        if (res.rank < 1) throw new Error('Accès réservé aux modérateurs et admins');
        localStorage.setItem(TOKEN_KEY, res.token);
        const user: CurrentUser = { userId: res.userId, username: res.username, rank: res.rank };
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.token.set(res.token);
        this.user.set(user);
        this.router.navigate([res.rank >= 2 ? '/dashboard' : '/users']);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.token.set(null);
    this.user.set(null);
    this.router.navigate(['/login']);
  }

  private loadUser(): CurrentUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
