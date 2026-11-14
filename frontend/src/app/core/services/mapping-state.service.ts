import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MessageService } from 'primeng/api';
import { Observable, catchError, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { EditableMapping, Hl7MappingDocument, Hl7MappingSummary } from '../models/hl7-mapping.model';
import { Hl7MessageDocument, Hl7MessageSummary, ParsedHl7 } from '../models/hl7-message.model';
import {
  addFieldToSection,
  createFieldId,
  mappingPaths,
  toEditableMapping,
  updateFieldInSections,
} from '../utils/mapping-adapter';
import { Hl7ApiService } from './hl7-api.service';
import { Hl7ParserService } from './hl7-parser.service';

@Injectable({ providedIn: 'root' })
export class MappingStateService {
  private readonly api = inject(Hl7ApiService);
  private readonly parser = inject(Hl7ParserService);
  private readonly toast = inject(MessageService);

  readonly mappings = signal<Hl7MappingSummary[]>([]);
  readonly messages = signal<Hl7MessageSummary[]>([]);
  readonly listsLoading = signal(false);

  readonly selectedMappingId = signal<string | null>(null);
  readonly selectedMessageId = signal<string | null>(null);

  /** Documents exactly as returned by the API. */
  readonly mappingDoc = signal<Hl7MappingDocument | null>(null);
  readonly messageDoc = signal<Hl7MessageDocument | null>(null);

  /** Editable deep copy of `mappingDoc`; all client-side edits land here. */
  readonly mapping = signal<EditableMapping | null>(null);

  private readonly mappingLoading = signal(false);
  private readonly messageLoading = signal(false);
  readonly loading = computed(() => this.mappingLoading() || this.messageLoading());

  /**
   * One tree for all fields, rebuilt only when the sample message or the loaded
   * mapping document changes (edits to `mapping` do not trigger a rebuild).
   * Paths referenced by the mapping but absent from the sample are added as placeholders.
   */
  readonly parsed = computed<ParsedHl7 | null>(() => {
    const message = this.messageDoc();
    if (!message) return null;
    const doc = this.mappingDoc();
    return this.parser.parse(message.message ?? '', doc ? mappingPaths(doc) : []);
  });

  readonly ready = computed(() => !!this.mapping() && !!this.parsed());

  constructor() {
    this.follow(this.selectedMappingId, this.mappingLoading, (id) => this.api.getMapping(id), 'mapping', (doc) => {
      this.mappingDoc.set(doc);
      this.mapping.set(doc ? toEditableMapping(doc) : null);
    });
    this.follow(this.selectedMessageId, this.messageLoading, (id) => this.api.getMessage(id), 'sample message', (doc) =>
      this.messageDoc.set(doc),
    );
  }

  loadLists(): void {
    this.listsLoading.set(true);
    let pending = 2;
    const done = () => --pending === 0 && this.listsLoading.set(false);

    this.api.listMappings().subscribe({
      next: (list) => this.mappings.set(list),
      error: (err) => this.notifyError('Could not load mappings', err),
    }).add(done);
    this.api.listMessages().subscribe({
      next: (list) => this.messages.set(list),
      error: (err) => this.notifyError('Could not load sample messages', err),
    }).add(done);
  }

  selectMapping(id: string | null): void {
    this.selectedMappingId.set(id || null);
  }

  selectMessage(id: string | null): void {
    this.selectedMessageId.set(id || null);
  }

  /* ---------------- Client-side edits ---------------- */

  setFieldHl7Fields(fieldId: string, hl7Fields: string[]): void {
    this.updateField(fieldId, (f) => ({ ...f, hl7Fields }));
    // TODO: persist via PUT /api/hl7-mapping/:id (body: toHl7MappingEntries(this.mapping()))
  }

  setFieldDefault(fieldId: string, defaultValue: string | null): void {
    this.updateField(fieldId, (f) => ({ ...f, defaultValue }));
    // TODO: persist via PUT /api/hl7-mapping/:id
  }

  addField(sectionKey: string, variable: string): void {
    const key = variable.trim();
    if (!key) return;
    this.mapping.update(
      (m) =>
        m && {
          ...m,
          sections: addFieldToSection(m.sections, sectionKey, {
            id: createFieldId(),
            key,
            label: key,
            hl7Fields: [],
            defaultValue: null,
          }),
        },
    );
    // TODO: persist via PUT /api/hl7-mapping/:id
  }

  removeField(fieldId: string): void {
    this.updateField(fieldId, () => null);
    // TODO: persist via PUT/DELETE /api/hl7-mapping/:id
  }

  hasVariable(variable: string): boolean {
    const target = variable.trim().toUpperCase();
    const walk = (sections: EditableMapping['sections']): boolean =>
      sections.some((s) => s.fields.some((f) => f.key.trim().toUpperCase() === target) || walk(s.children));
    return !!target && walk(this.mapping()?.sections ?? []);
  }

  notifyError(summary: string, err: unknown): void {
    const detail =
      err instanceof HttpErrorResponse
        ? (err.error?.error as string | undefined) ?? (err.status === 0 ? 'API is unreachable' : err.message)
        : String(err);
    this.toast.add({ severity: 'error', summary, detail, life: 6000 });
  }

  /* ---------------- internals ---------------- */

  private updateField(fieldId: string, update: Parameters<typeof updateFieldInSections>[2]): void {
    this.mapping.update((m) => m && { ...m, sections: updateFieldInSections(m.sections, fieldId, update) });
  }

  /** Re-fetches a document whenever its selected id changes; stale requests are cancelled. */
  private follow<T>(
    id$: Signal<string | null>,
    loading: WritableSignal<boolean>,
    fetch: (id: string) => Observable<T>,
    what: string,
    apply: (doc: T | null) => void,
  ): void {
    toObservable(id$)
      .pipe(
        distinctUntilChanged(),
        tap((id) => loading.set(!!id)),
        switchMap((id) =>
          id
            ? fetch(id).pipe(
                catchError((err) => {
                  this.notifyError(`Could not load ${what}`, err);
                  return of(null);
                }),
              )
            : of(null),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((doc) => {
        apply(doc);
        loading.set(false);
      });
  }
}
