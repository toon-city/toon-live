import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { Observable } from 'rxjs';

export interface EntityOption {
  id: number | string;
  label: string;
}

/**
 * Select2-style searchable picker for "type a raw ID" fields — the admin
 * types a name, sees matches, picks one; the control's value is still just
 * the id underneath (works as a drop-in for both formControlName and plain
 * [(ngModel)], same as any other ControlValueAccessor).
 *
 * Doesn't own its own HTTP call — callers pass `searchFn` (query -> options,
 * reusing whatever list/search endpoint that entity already has, e.g.
 * AdminItemsService.list) and an optional `resolveFn` (id -> option, to
 * show the right label when writeValue() is called with an existing id and
 * no matching option is in `suggestions` yet — e.g. opening an edit dialog).
 */
@Component({
  selector: 'app-entity-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule, AutoCompleteModule],
  template: `
    <p-autoComplete
      [(ngModel)]="selected"
      [suggestions]="suggestions"
      field="label"
      [dropdown]="true"
      [forceSelection]="true"
      [disabled]="disabled"
      [placeholder]="placeholder"
      styleClass="w-full"
      [inputStyleClass]="'w-full'"
      (completeMethod)="onComplete($event)"
      (onSelect)="onSelect($event.value)"
      (onClear)="onSelect(null)"
      (onBlur)="onTouched()"
    />
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EntityAutocompleteComponent),
      multi: true,
    },
  ],
})
export class EntityAutocompleteComponent implements ControlValueAccessor {
  /** Query -> matching options. Required — e.g. `term => this.itemsService.list(term).pipe(map(p => p.content.map(i => ({id: i.id, label: i.name}))))`. */
  @Input({ required: true }) searchFn!: (term: string) => Observable<EntityOption[]>;

  /** id -> its option, to resolve a label for a value set via writeValue() before any search has run (edit dialogs). Omit if the caller already has the label some other way. */
  @Input() resolveFn?: (id: number | string) => Observable<EntityOption | null>;

  @Input() placeholder = 'Rechercher…';

  /** Emits the full picked option (id + label), not just the id — handy when the caller wants the label without a second lookup. */
  @Output() picked = new EventEmitter<EntityOption | null>();

  suggestions: EntityOption[] = [];
  selected: EntityOption | null = null;
  disabled = false;

  private onChange: (value: number | string | null) => void = () => {};
  onTouched: () => void = () => {};

  onComplete(event: AutoCompleteCompleteEvent): void {
    this.searchFn(event.query ?? '').subscribe({
      next: (options) => (this.suggestions = options),
      error: () => (this.suggestions = []),
    });
  }

  onSelect(option: EntityOption | null): void {
    this.selected = option;
    this.onChange(option?.id ?? null);
    this.picked.emit(option);
  }

  writeValue(value: number | string | null): void {
    if (value === null || value === undefined) {
      this.selected = null;
      return;
    }
    if (this.selected?.id === value) return;
    if (this.resolveFn) {
      this.resolveFn(value).subscribe((option) => (this.selected = option));
    } else {
      // No resolver given — show the raw id until the admin searches; not
      // pretty, but better than silently losing the value.
      this.selected = { id: value, label: String(value) };
    }
  }

  registerOnChange(fn: (value: number | string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
