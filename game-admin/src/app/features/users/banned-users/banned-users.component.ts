import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { RouterModule } from '@angular/router';
import { AdminUsersService } from '../../../core/services/admin-users.service';
import { AdminUser, Page } from '../../../core/models/models';

@Component({
  selector: 'app-banned-users',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TableModule, ButtonModule, TagModule, ToastModule],
  providers: [MessageService],
  templateUrl: './banned-users.component.html'
})
export class BannedUsersComponent implements OnInit {
  private readonly usersService = inject(AdminUsersService);
  private readonly messages = inject(MessageService);

  users = signal<AdminUser[]>([]);
  totalRecords = signal(0);
  loading = signal(false);

  ngOnInit() { this.load(0); }

  load(page: number) {
    this.loading.set(true);
    this.usersService.list(undefined, true, page).subscribe({
      next: (p: Page<AdminUser>) => {
        this.users.set(p.content);
        this.totalRecords.set(p.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onPage(evt: any) { this.load(evt.first / evt.rows); }

  unban(user: AdminUser) {
    this.usersService.unban(user.id).subscribe({
      next: () => {
        this.messages.add({ severity: 'success', summary: 'Débanni', detail: `${user.username} débanni.` });
        this.load(0);
      }
    });
  }
}
