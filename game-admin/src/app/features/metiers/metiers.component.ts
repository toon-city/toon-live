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
import { DropdownModule } from 'primeng/dropdown';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminMetiersService } from '../../core/services/admin-metiers.service';
import { MetierInfo } from '../../core/models/models';

@Component({
  selector: 'app-metiers',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, DropdownModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './metiers.component.html',
  styleUrls: ['./metiers.component.scss'],
})
export class MetiersComponent implements OnInit {
  private readonly metiersService = inject(AdminMetiersService);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  metiers = signal<MetierInfo[]>([]);
  loading = signal(false);

  /** null = pas de condition — même convention que l'ItemType/SubType picker (voir items.component.ts). */
  toonizLevels = [
    { label: 'Aucune condition', value: null },
    { label: 'Bronze',           value: 1 },
    { label: 'Argent',           value: 2 },
    { label: 'Or',                value: 3 },
  ];

  createDialog = false;
  editMetier: MetierInfo | null = null;

  form = this.fb.group({
    name:            ['', Validators.required],
    dailyPez:        [0, Validators.required],
    minToonizLevel:  [null as number | null],
    minDaysPlayed:   [null as number | null],
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.metiersService.list().subscribe({
      next: (list) => { this.metiers.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  toonizLabel(level: number | null): string {
    return this.toonizLevels.find(t => t.value === level)?.label ?? 'Aucune condition';
  }

  openCreate() {
    this.editMetier = null;
    this.form.reset({ name: '', dailyPez: 0, minToonizLevel: null, minDaysPlayed: null });
    this.createDialog = true;
  }

  openEdit(metier: MetierInfo) {
    this.editMetier = metier;
    this.form.patchValue({
      name: metier.name,
      dailyPez: metier.dailyPez,
      minToonizLevel: metier.minToonizLevel,
      minDaysPlayed: metier.minDaysPlayed,
    });
    this.createDialog = true;
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue() as any;
    const obs = this.editMetier
      ? this.metiersService.update(this.editMetier.id, v)
      : this.metiersService.create(v);
    obs.subscribe({
      next: () => {
        this.messages.add({ severity: 'success', summary: this.editMetier ? 'Modifié' : 'Créé' });
        this.createDialog = false;
        this.load();
      },
      error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message }),
    });
  }

  deleteMetier(metier: MetierInfo) {
    this.confirm.confirm({
      message: `Supprimer le métier "${metier.name}" ? Les joueurs qui l'exercent le perdront.`,
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.metiersService.delete(metier.id).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Supprimé' });
          this.load();
        },
      }),
    });
  }
}
