import { Component, computed, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, ButtonModule, ToastModule],
  providers: [MessageService],
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  readonly user = this.authService.user;
  readonly isLoggedIn = computed(() => !!this.user());
  readonly isAdmin = computed(() => (this.user()?.rank ?? 0) >= 2);
  readonly isModerator = computed(() => (this.user()?.rank ?? 0) >= 1);

  logout(): void {
    this.authService.logout();
  }
}
