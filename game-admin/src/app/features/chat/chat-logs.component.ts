import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { map } from 'rxjs';
import { AdminChatService } from '../../core/services/admin-chat.service';
import { AdminRoomsService } from '../../core/services/admin-rooms.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatMessage, Page } from '../../core/models/models';
import { EntityAutocompleteComponent, EntityOption } from '../../shared/components/entity-autocomplete/entity-autocomplete.component';

@Component({
  selector: 'app-chat-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, ButtonModule, InputTextModule, TagModule, ToastModule, ConfirmDialogModule, EntityAutocompleteComponent],
  providers: [ConfirmationService, MessageService],
  templateUrl: './chat-logs.component.html',
  styleUrls: ['./chat-logs.component.scss']
})
export class ChatLogsComponent implements OnInit {
  private readonly chatService = inject(AdminChatService);
  private readonly roomsService = inject(AdminRoomsService);
  private readonly authService = inject(AuthService);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  logs = signal<ChatMessage[]>([]);
  totalRecords = signal(0);
  loading = signal(false);

  readonly searchRooms = (term: string) =>
    this.roomsService.list(term).pipe(map(page => page.content.map(r => ({ id: r.id, label: r.name } as EntityOption))));

  filterRoomId: number | null = null;
  filterUsername = '';

  get isAdmin() { return (this.authService.user()?.rank ?? 0) >= 2; }

  ngOnInit() { this.load(0); }

  load(page: number) {
    this.loading.set(true);
    this.chatService.list(
      this.filterRoomId ?? undefined,
      this.filterUsername || undefined,
      page
    ).subscribe({
      next: (p: Page<ChatMessage>) => {
        this.logs.set(p.content);
        this.totalRecords.set(p.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onPage(evt: any) { this.load(evt.first / evt.rows); }

  deleteMsg(msg: ChatMessage) {
    this.confirm.confirm({
      message: 'Supprimer ce message ?',
      accept: () => this.chatService.delete(msg.id).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Supprimé' });
          this.load(0);
        }
      })
    });
  }
}
