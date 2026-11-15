import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MessageService } from 'primeng/api';
import { Observable, catchError, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import {
  EditableMapping,
  Hl7MappingDocument,
  Hl7MappingSummary,
  SegmentVariableGroup,
} from '../models/hl7-mapping.model';
import { Hl7MessageDocument, Hl7MessageSummary, ParsedHl7 } from '../models/hl7-message.model';
import {
  addFieldToSection,
  createFieldId,
  fieldsMissingPaths,
  insertSection,
  mappingFingerprint,
  mappingPaths,
  toEditableMapping,
  toHl7MappingEntries,
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
  /** Distinct variables per HL7 segment, shared by every mapping. */
  readonly variableCatalog = signal<SegmentVariableGroup[]>([]);
  readonly listsLoading = signal(false);

  readonly selectedMappingId = signal<string | null>(null);
  readonly selectedMessageId = signal<string | null>(null);

  /** Documents exactly as returned by the API. */
  readonly mappingDoc = signal<Hl7MappingDocument | null>(null);
  readonly messageDoc = signal<Hl7MessageDocument | null>(null);

  /** Editable deep copy of `mappingDoc`; all client-side edits land here until Save. */
  readonly mapping = signal<EditableMapping | null>(null);

  /** Fingerprint of the last loaded or saved mapping. */
  private readonly savedFingerprint = signal<string | null>(null);
  readonly dirty = computed(() => {
    const current = this.mapping();
    const saved = this.savedFingerprint();
    return !!current && saved !== null && mappingFingerprint(current) !== saved;
  });
  readonly saving = signal(false);
  /** Section key to expand after the user adds a segment that was not on the mapping. */
  readonly focusSection = signal<string | null>(null);

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
    this.follow(
      this.selectedMappingId,
      this.mappingLoading,
      (id) => this.api.getMapping(id),
      'mapping',
      (doc) => {
        this.mappingDoc.set(doc);
        const editable = doc ? toEditableMapping(doc) : null;
        this.focusSection.set(null);
        this.mapping.set(editable);
        this.savedFingerprint.set(editable ? mappingFingerprint(editable) : null);
      },
    );
    this.follow(
      this.selectedMessageId,
      this.messageLoading,
      (id) => this.api.getMessage(id),
      'sample message',
      (doc) => this.messageDoc.set(doc),
    );
  }

  loadLists(): void {
    this.listsLoading.set(true);
    let pending = 3;
    const done = () => --pending === 0 && this.listsLoading.set(false);

    this.api
      .listVariableCatalog()
      .subscribe({
        next: (catalog) => this.variableCatalog.set(catalog),
        error: (err) => this.notifyError('Could not load variable list', err),
      })
      .add(done);
    this.api
      .listMappings()
      .subscribe({
        next: (list) => this.mappings.set(list),
        error: (err) => this.notifyError('Could not load mappings', err),
      })
      .add(done);
    this.api
      .listMessages()
      .subscribe({
        next: (list) => this.messages.set(list),
        error: (err) => this.notifyError('Could not load sample messages', err),
      })
      .add(done);
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
  }

  setFieldDefault(fieldId: string, defaultValue: string | null): void {
    this.updateField(fieldId, (f) => ({ ...f, defaultValue }));
  }

  addSection(sectionKey: string): void {
    const key = sectionKey.trim();
    if (!key) return;
    this.focusSection.set(key);
    this.mapping.update((m) => m && { ...m, sections: insertSection(m.sections, key) });
  }

  addField(sectionKey: string, variable: string): void {
    const key = variable.trim();
    if (!key || this.hasVariable(key)) return;
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
  }

  removeField(fieldId: string): void {
    this.updateField(fieldId, () => null);
  }

  /** Drop unsaved edits and restore the last loaded or saved mapping. */
  cancel(): void {
    if (this.saving()) return;
    const doc = this.mappingDoc();
    this.mapping.set(doc ? toEditableMapping(doc) : null);
  }

  /** Persist the editable mapping with PUT /api/hl7-mapping/:id. */
  save(): void {
    const mapping = this.mapping();
    const id = this.selectedMappingId();
    if (!mapping || !id || this.saving() || !this.dirty()) return;

    const missing = fieldsMissingPaths(mapping);
    if (missing.length) {
      const shown = missing.slice(0, 3).join(', ');
      const extra = missing.length > 3 ? ` and ${missing.length - 3} more` : '';
      this.toast.add({
        severity: 'warn',
        summary: 'Cannot save',
        detail: `Select an HL7 field for ${shown}${extra}.`,
        life: 5000,
      });
      return;
    }

    const sentFingerprint = mappingFingerprint(mapping);
    this.saving.set(true);
    this.api
      .updateMapping(id, toHl7MappingEntries(mapping))
      .subscribe({
        next: (doc) => {
          this.applySaved(doc, id, sentFingerprint);
          this.toast.add({
            severity: 'success',
            summary: 'Mapping saved',
            detail: doc.displayName,
            life: 3000,
          });
        },
        error: (err) => this.notifyError('Could not save mapping', err),
      })
      .add(() => this.saving.set(false));
  }

  hasVariable(variable: string): boolean {
    const target = variable.trim().toUpperCase();
    const walk = (sections: EditableMapping['sections']): boolean =>
      sections.some(
        (s) => s.fields.some((f) => f.key.trim().toUpperCase() === target) || walk(s.children),
      );
    return !!target && walk(this.mapping()?.sections ?? []);
  }

  notifyError(summary: string, err: unknown): void {
    const detail =
      err instanceof HttpErrorResponse
        ? ((err.error?.error as string | undefined) ??
          (err.status === 0 ? 'API is unreachable' : err.message))
        : String(err);
    this.toast.add({ severity: 'error', summary, detail, life: 6000 });
  }

  /* ---------------- internals ---------------- */

  private applySaved(doc: Hl7MappingDocument, id: string, sentFingerprint: string): void {
    this.mappings.update((list) =>
      list.map((item) =>
        item._id === doc._id
          ? { ...item, fieldCount: doc.hl7Mappings?.length ?? 0, updatedAt: doc.updatedAt }
          : item,
      ),
    );
    if (this.selectedMappingId() !== id) return;

    const savedView = toEditableMapping(doc);
    this.mappingDoc.set(doc);
    this.savedFingerprint.set(mappingFingerprint(savedView));
    const current = this.mapping();
    if (current && mappingFingerprint(current) === sentFingerprint) {
      this.mapping.set(savedView);
    }
  }

  private updateField(fieldId: string, update: Parameters<typeof updateFieldInSections>[2]): void {
    this.mapping.update(
      (m) => m && { ...m, sections: updateFieldInSections(m.sections, fieldId, update) },
    );
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
