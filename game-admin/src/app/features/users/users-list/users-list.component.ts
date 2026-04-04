import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AdminUsersService } from '../../../core/services/admin-users.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdminUser, Page } from '../../../core/models/models';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TableModule, ButtonModule, InputTextModule, TagModule, ConfirmDialogModule, DialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './users-list.component.html',
  styleUrls: ['./users-list.component.scss']
})
export class UsersListComponent implements OnInit {
  private readonly usersService = inject(AdminUsersService);
  private readonly authService = inject(AuthService);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  users = signal<AdminUser[]>([]);
  totalRecords = signal(0);
  loading = signal(false);
  search = '';
  filterBanned: boolean | null = null;

  banDialog = false;
  banTarget: AdminUser | null = null;
  banReason = '';

  get isAdmin() { return (this.authService.user()?.rank ?? 0) >= 2; }

  ngOnInit() { this.load(0); }

  load(page: number) {
    this.loading.set(true);
    const banned = this.filterBanned === null ? undefined : this.filterBanned;
    this.usersService.list(this.search || undefined, banned, page).subscribe({
      next: (p: Page<AdminUser>) => {
        this.users.set(p.content);
        this.totalRecords.set(p.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onPage(evt: any) { this.load(evt.first / evt.rows); }

  rankLabel(rank: number): string {
    return ['Joueur', 'Modérateur', 'Admin'][rank] ?? 'Inconnu';
  }

  rankSeverity(rank: number): 'success' | 'info' | 'warning' {
    return ([, 'info', 'warning'] as any)[rank] ?? 'info';
  }

  openBan(user: AdminUser) {
    this.banTarget = user;
    this.banReason = '';
    this.banDialog = true;
  }

  confirmBan() {
    if (!this.banTarget) return;
    this.usersService.ban(this.banTarget.id, { reason: this.banReason }).subscribe({
      next: () => {
        this.messages.add({ severity: 'success', summary: 'Banni', detail: `${this.banTarget!.username} a été banni.` });
        this.banDialog = false;
        this.load(0);
      },
      error: (e: any) => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message ?? 'Erreur' })
    });
  }

  unban(user: AdminUser) {
    this.confirm.confirm({
      message: `Débannir ${user.username} ?`,
      accept: () => this.usersService.unban(user.id).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Débanni', detail: `${user.username} a été débanni.` });
          this.load(0);
        }
      })
    });
  }
}
