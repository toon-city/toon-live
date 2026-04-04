import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminRoomsService } from '../../core/services/admin-rooms.service';
import { AdminRoom, Page } from '../../core/models/models';

@Component({
  selector: 'app-rooms',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TooltipModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './rooms.component.html',
  styleUrls: ['./rooms.component.scss']
})
export class RoomsComponent implements OnInit {
  private readonly roomsService = inject(AdminRoomsService);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  rooms = signal<AdminRoom[]>([]);
  totalRecords = signal(0);
  loading = signal(false);
  search = '';

  editDialog = false;
  editRoom: AdminRoom | null = null;
  editForm = this.fb.group({
    name:     ['', Validators.required],
    maxUsers: [20, [Validators.required, Validators.min(1)]]
  });

  ngOnInit() { this.load(0); }

  load(page: number) {
    this.loading.set(true);
    this.roomsService.list(this.search || undefined, page).subscribe({
      next: (p: Page<AdminRoom>) => {
        this.rooms.set(p.content);
        this.totalRecords.set(p.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onPage(evt: any) { this.load(evt.first / evt.rows); }

  openEdit(room: AdminRoom) {
    this.editRoom = room;
    this.editForm.patchValue({ name: room.name, maxUsers: room.maxUsers });
    this.editDialog = true;
  }

  saveEdit() {
    if (!this.editRoom || this.editForm.invalid) return;
    const v = this.editForm.getRawValue();
    this.roomsService.update(this.editRoom.id, { name: v.name!, maxUsers: v.maxUsers! }).subscribe({
      next: () => {
        this.messages.add({ severity: 'success', summary: 'Sauvegardé' });
        this.editDialog = false;
        this.load(0);
      },
      error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }

  toggleLock(room: AdminRoom) {
    const action = room.locked
      ? this.roomsService.unlock(room.id)
      : this.roomsService.lock(room.id);
    action.subscribe({
      next: () => this.load(0),
      error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }

  kickAll(room: AdminRoom) {
    this.confirm.confirm({
      message: `Expulser tous les joueurs de "${room.name}" ?`,
      accept: () => this.roomsService.kickAll(room.id).subscribe({
        next: () => this.messages.add({ severity: 'success', summary: `Joueurs expulsés de ${room.name}` }),
        error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
      })
    });
  }

  deleteRoom(room: AdminRoom) {
    this.confirm.confirm({
      message: `Supprimer la salle "${room.name}" ?`,
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.roomsService.delete(room.id).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Supprimé' });
          this.load(0);
        }
      })
    });
  }
}
