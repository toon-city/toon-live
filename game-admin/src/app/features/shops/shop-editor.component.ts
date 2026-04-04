import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TabViewModule } from 'primeng/tabview';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminShopsService } from '../../core/services/admin-shops.service';
import { ShopItem, CollectionInfo } from '../../core/models/models';

@Component({
  selector: 'app-shop-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TabViewModule, TableModule, ButtonModule, InputTextModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, InputSwitchModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './shop-editor.component.html',
  styleUrls: ['./shop-editor.component.scss']
})
export class ShopEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly shopsService = inject(AdminShopsService);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  shopId = signal('');
  items = signal<ShopItem[]>([]);
  collections = signal<CollectionInfo[]>([]);

  // --- Shop item dialog ---
  itemDialog = false;
  editShopItem: ShopItem | null = null;
  itemForm = this.fb.group({
    itemId:    [0, Validators.required],
    pezPrice:  [null as number | null],
    kredPrice: [null as number | null],
    kredBonus: [0],
    stock:     [null as number | null]
  });

  // --- Collection dialog ---
  colDialog = false;
  editCol: CollectionInfo | null = null;
  colForm = this.fb.group({
    name:        ['', Validators.required],
    bannerImage: [''],
    sortOrder:   [0],
    enabled:     [true]
  });

  ngOnInit() {
    this.shopId.set(this.route.snapshot.paramMap.get('shopId') ?? '');
    this.loadItems();
    this.loadCollections();
  }

  loadItems() {
    this.shopsService.listItems(this.shopId()).subscribe((page: any) => {
      this.items.set(Array.isArray(page) ? page : (page.content ?? []));
    });
  }

  loadCollections() {
    this.shopsService.listCollections(this.shopId()).subscribe(cols => this.collections.set(cols));
  }

  // --- Items CRUD ---
  openCreateItem() {
    this.editShopItem = null;
    this.itemForm.reset({ pezPrice: null, kredPrice: null, kredBonus: 0, stock: null });
    this.itemDialog = true;
  }

  openEditItem(item: ShopItem) {
    this.editShopItem = item;
    this.itemForm.patchValue({ itemId: item.item.id, pezPrice: item.pezPrice, kredPrice: item.kredPrice, kredBonus: item.kredBonus, stock: item.stock });
    this.itemDialog = true;
  }

  saveItem() {
    if (this.itemForm.invalid) return;
    const v = this.itemForm.getRawValue() as any;
    const obs = this.editShopItem
      ? this.shopsService.updateItem(this.shopId(), this.editShopItem.id, v)
      : this.shopsService.createItem(this.shopId(), v);
    obs.subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Sauvegardé' }); this.itemDialog = false; this.loadItems(); },
      error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }

  deleteItem(item: ShopItem) {
    this.confirm.confirm({
      message: `Retirer "${item.item.name}" de la boutique ?`,
      accept: () => this.shopsService.deleteItem(this.shopId(), item.id).subscribe({
        next: () => { this.messages.add({ severity: 'success', summary: 'Supprimé' }); this.loadItems(); }
      })
    });
  }

  // --- Collections CRUD ---
  openCreateCol() {
    this.editCol = null;
    this.colForm.reset({ sortOrder: 0, enabled: true });
    this.colDialog = true;
  }

  openEditCol(col: CollectionInfo) {
    this.editCol = col;
    this.colForm.patchValue({ name: col.name, bannerImage: col.bannerImage ?? '', sortOrder: col.sortOrder, enabled: col.enabled });
    this.colDialog = true;
  }

  saveCol() {
    if (this.colForm.invalid) return;
    const v = this.colForm.getRawValue() as any;
    const obs = this.editCol
      ? this.shopsService.updateCollection(this.shopId(), this.editCol.id, v)
      : this.shopsService.createCollection(this.shopId(), v);
    obs.subscribe({
      next: () => { this.messages.add({ severity: 'success', summary: 'Sauvegardé' }); this.colDialog = false; this.loadCollections(); },
      error: e => this.messages.add({ severity: 'error', summary: 'Erreur', detail: e.error?.message })
    });
  }

  deleteCol(col: CollectionInfo) {
    this.confirm.confirm({
      message: `Supprimer la collection "${col.name}" ?`,
      accept: () => this.shopsService.deleteCollection(this.shopId(), col.id).subscribe({
        next: () => { this.messages.add({ severity: 'success', summary: 'Supprimé' }); this.loadCollections(); }
      })
    });
  }
}
