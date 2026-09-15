import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AdminUsersService } from '../../../core/services/admin-users.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdminUser } from '../../../core/models/models';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, CardModule, TagModule, ButtonModule, TableModule, DialogModule, InputTextModule, FormsModule, ToastModule],
  providers: [MessageService],
  templateUrl: './user-detail.component.html',
  styleUrls: ['./user-detail.component.scss']
})
export class UserDetailComponent implements OnInit {
  private readonly usersService = inject(AdminUsersService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly messages = inject(MessageService);

  user = signal<AdminUser | null>(null);
  loading = signal(true);

  banDialog = false;
  banReason = '';
  rankDialog = false;
  newRank = 0;
  balanceDialog = false;
  newPez = 0;
  newKreds = 0;

  get isAdmin() { return (this.authService.user()?.rank ?? 0) >= 2; }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.usersService.get(id).subscribe({
      next: u => { this.user.set(u); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  rankLabel(rank: number) { return ['Joueur', 'Modérateur', 'Admin'][rank] ?? '?'; }

  openBan() { this.banReason = ''; this.banDialog = true; }

  doBan() {
    this.usersService.ban(this.user()!.id, { reason: this.banReason }).subscribe({
      next: u => { this.user.set(u); this.banDialog = false; },
      error: (e: any) => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }

  doUnban() {
    this.usersService.unban(this.user()!.id).subscribe(u => this.user.set(u));
  }

  openRank() { this.newRank = this.user()!.rank; this.rankDialog = true; }

  doUpdateRank() {
    this.usersService.updateRank(this.user()!.id, { rank: this.newRank }).subscribe({
      next: u => { this.user.set(u); this.rankDialog = false; },
      error: (e: any) => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }

  openBalance() {
    this.newPez = this.user()!.pez;
    this.newKreds = this.user()!.kreds;
    this.balanceDialog = true;
  }

  doUpdateBalance() {
    this.usersService.updateBalance(this.user()!.id, { pez: this.newPez, kreds: this.newKreds }).subscribe({
      next: u => { this.user.set(u); this.balanceDialog = false; },
      error: (e: any) => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }
}
