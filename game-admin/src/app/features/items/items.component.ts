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
import { DropdownModule } from 'primeng/dropdown';
import { AdminItemsService } from '../../core/services/admin-items.service';
import { ItemInfo, Page } from '../../core/models/models';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TableModule, ButtonModule, InputTextModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, DropdownModule, InputSwitchModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './items.component.html',
  styleUrls: ['./items.component.scss']
})
export class ItemsComponent implements OnInit {
  private readonly itemsService = inject(AdminItemsService);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  items = signal<ItemInfo[]>([]);
  totalRecords = signal(0);
  loading = signal(false);
  search = '';
  typeFilter = '';

  itemTypes = [
    { label: 'FURNITURE', value: 'FURNITURE' },
    { label: 'CLOTHING',  value: 'CLOTHING'  },
    { label: 'MISC',      value: 'MISC'       }
  ];
  allTypes = [{ label: 'Tous', value: '' }, ...this.itemTypes];
  subTypes = [
    'FLOOR','WALL','WALLPAPER','PIECE','HAIRSTYLE','HAT','TOP','BOTTOM','MAKEUP','OTHER'
  ].map(s => ({ label: s, value: s }));

  createDialog = false;
  editItem: ItemInfo | null = null;

  form = this.fb.group({
    name:         ['', Validators.required],
    itemType:     ['CLOTHING', Validators.required],
    subType:      ['TOP', Validators.required],
    possessable:  [true],
    displayImage: ['', Validators.required],
    spritePath:   [''],
    spriteKey:    ['']
  });

  ngOnInit() { this.load(0); }

  load(page: number) {
    this.loading.set(true);
    this.itemsService.list(this.search || undefined, this.typeFilter || undefined, page).subscribe({
      next: (p: Page<ItemInfo>) => {
        this.items.set(p.content);
        this.totalRecords.set(p.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onPage(evt: any) { this.load(evt.first / evt.rows); }

  openCreate() {
    this.editItem = null;
    this.form.reset({ itemType: 'CLOTHING', subType: 'TOP', possessable: true });
    this.createDialog = true;
  }

  openEdit(item: ItemInfo) {
    this.editItem = item;
    this.form.patchValue({
      name: item.name,
      itemType: item.itemType,
      subType: item.subType,
      possessable: item.possessable,
      displayImage: item.displayImage ?? '',
      spritePath: item.spritePath ?? '',
      spriteKey: item.spriteKey ?? ''
    });
    this.createDialog = true;
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue() as any;
    const obs = this.editItem
      ? this.itemsService.update(this.editItem.id, v)
      : this.itemsService.create(v);
    obs.subscribe({
      next: () => {
        this.messages.add({ severity: 'success', summary: this.editItem ? 'Modifié' : 'Créé' });
        this.createDialog = false;
        this.load(0);
      },
      error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }

  deleteItem(item: ItemInfo) {
    this.confirm.confirm({
      message: `Supprimer "${item.name}" ?`,
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.itemsService.delete(item.id).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Supprimé' });
          this.load(0);
        }
      })
    });
  }
}


