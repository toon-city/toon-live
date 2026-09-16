import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DropdownModule } from 'primeng/dropdown';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminTradesService } from '../../core/services/admin-trades.service';
import { TradeOfferInfo } from '../../core/models/models';

@Component({
  selector: 'app-trades',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, ButtonModule, InputTextModule, TagModule, ToastModule, ConfirmDialogModule, DropdownModule, TooltipModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './trades.component.html',
  styleUrls: ['./trades.component.scss'],
})
export class TradesComponent implements OnInit {
  private readonly tradesService = inject(AdminTradesService);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

  trades = signal<TradeOfferInfo[]>([]);
  totalRecords = signal(0);
  loading = signal(false);

  username = '';
  statusFilter = '';
  statusOptions = [
    { label: 'Tous', value: '' },
    { label: 'En cours', value: 'OPEN' },
    { label: 'Acceptés', value: 'ACCEPTED' },
    { label: 'Annulés', value: 'CANCELLED' },
  ];

  private page = 0;

  ngOnInit() {
    this.load();
  }

  load(page = 0) {
    this.page = page;
    this.loading.set(true);
    this.tradesService.list(this.statusFilter || undefined, this.username || undefined, page).subscribe({
      next: (p) => {
        this.trades.set(p.content);
        this.totalRecords.set(p.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onPage(evt: any) { this.load(evt.first / evt.rows); }

  statusSeverity(status: string): 'success' | 'danger' | 'info' {
    if (status === 'ACCEPTED') return 'success';
    if (status === 'CANCELLED') return 'danger';
    return 'info';
  }

  cancelTrade(trade: TradeOfferInfo) {
    this.confirm.confirm({
      message: `Annuler de force l'échange #${trade.id} (${trade.offererUsername}) ? Les pez engagés lui seront remboursés.`,
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.tradesService.cancel(trade.id).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Échange annulé' });
          this.load(this.page);
        },
        error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message }),
      }),
    });
  }
}
