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
import { InputSwitchModule } from 'primeng/inputswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { KredsService } from '../../core/services/kreds.service';
import { KredsPackage, Page } from '../../core/models/models';

@Component({
  selector: 'app-kreds-packages',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, InputSwitchModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './kreds-packages.component.html',
  styleUrls: ['./kreds-packages.component.scss']
})
export class KredsPackagesComponent implements OnInit {
  private readonly kredsService = inject(KredsService);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  packages = signal<KredsPackage[]>([]);
  totalRecords = signal(0);
  loading = signal(false);
  currentPage = 0;

  dialog = false;
  editPkg: KredsPackage | null = null;

  form = this.fb.group({
    name:        ['', Validators.required],
    kredsAmount: [100, [Validators.required, Validators.min(1)]],
    priceCents:  [499, [Validators.required, Validators.min(1)]],
    active:      [true]
  });

  ngOnInit() { this.load(0); }

  load(page: number) {
    this.currentPage = page;
    this.loading.set(true);
    this.kredsService.listAll(page).subscribe({
      next: (p: Page<KredsPackage>) => {
        this.packages.set(p.content);
        this.totalRecords.set(p.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onPage(evt: any) { this.load(evt.first / evt.rows); }

  priceEuros(cents: number) { return (cents / 100).toFixed(2) + ' €'; }

  openCreate() {
    this.editPkg = null;
    this.form.reset({ name: '', kredsAmount: 100, priceCents: 499, active: true });
    this.dialog = true;
  }

  openEdit(pkg: KredsPackage) {
    this.editPkg = pkg;
    this.form.patchValue({ name: pkg.name, kredsAmount: pkg.kredsAmount, priceCents: pkg.priceCents, active: pkg.active });
    this.dialog = true;
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue() as any;
    const obs = this.editPkg
      ? this.kredsService.update(this.editPkg.id, v)
      : this.kredsService.create(v);
    obs.subscribe({
      next: () => {
        this.messages.add({ severity: 'success', summary: this.editPkg ? 'Modifié' : 'Créé' });
        this.dialog = false;
        this.load(this.currentPage);
      },
      error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }

  deletePkg(pkg: KredsPackage) {
    this.confirm.confirm({
      message: `Supprimer le pack "${pkg.name}" ?`,
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.kredsService.delete(pkg.id).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Supprimé' });
          this.load(0);
        }
      })
    });
  }
}
