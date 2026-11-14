import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TreeSelectModule } from 'primeng/treeselect';
import { MappingField } from '../../../core/models/hl7-mapping.model';
import { Hl7TreeNode } from '../../../core/models/hl7-message.model';
import { syncExpansion } from '../../../core/services/hl7-parser.service';
import { MappingStateService } from '../../../core/services/mapping-state.service';
import { DefaultValueDialogComponent } from '../default-value-dialog/default-value-dialog.component';

const sameNodes = (a: Hl7TreeNode[], b: Hl7TreeNode[]) =>
  a.length === b.length && a.every((n, i) => n === b[i]);

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

@Component({
  selector: 'app-mapping-field',
  standalone: true,
  imports: [
    FormsModule,
    TreeSelectModule,
    ButtonModule,
    TooltipModule,
    DefaultValueDialogComponent,
  ],
  templateUrl: './mapping-field.component.html',
  styleUrl: './mapping-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MappingFieldComponent {
  readonly field = input.required<MappingField>();

  private readonly state = inject(MappingStateService);
  private readonly confirmation = inject(ConfirmationService);

  readonly tree = computed(() => this.state.parsed()?.tree ?? []);

  /**
   * TreeSelect's model is an array of node references, so keys are resolved through the
   * shared index. The custom equality keeps the array identity stable when the user's
   * own selection round-trips through state, which avoids a redundant writeValue.
   */
  readonly selectedNodes = computed<Hl7TreeNode[]>(
    () => {
      const index = this.state.parsed()?.nodeIndex;
      if (!index) return [];
      const nodes = this.field()
        .hl7Fields.map((key) => index.get(key))
        .filter((n): n is Hl7TreeNode => !!n);
      return [...new Set(nodes)];
    },
    { equal: sameNodes },
  );

  readonly values = computed(() => {
    const valueMap = this.state.parsed()?.valueMap;
    return this.field().hl7Fields.map((key) => valueMap?.get(key) ?? '');
  });
  readonly displayValue = computed(() => this.values().join(' / '));
  readonly hasAnyValue = computed(() => this.values().some((v) => v !== ''));
  readonly pathsLabel = computed(() => this.field().hl7Fields.join(' / '));
  readonly hasDefault = computed(() => {
    const v = this.field().defaultValue;
    return v !== null && v !== undefined && v !== '';
  });
  readonly tooltip = computed(() => {
    const f = this.field();
    return [f.key, f.description, f.hl7Fields.length ? f.hl7Fields.join(' / ') : null]
      .filter(Boolean)
      .join('\n');
  });

  readonly editing = signal(false);

  onSelectionChange(nodes: Hl7TreeNode[] | null): void {
    const index = this.state.parsed()?.nodeIndex;
    const selected = (nodes ?? []).map((n) => n.key!);
    // Keys that match no tree node (malformed stored paths) can't be toggled in the tree; keep them.
    const unresolved = this.field().hl7Fields.filter((k) => !index?.has(k));
    this.state.setFieldHl7Fields(this.field().id, [...new Set([...selected, ...unresolved])]);
  }

  /**
   * The tree is shared by every field, so reset its expansion to this field's selection.
   * Runs on mousedown (before the panel renders) and again on show for keyboard opening.
   */
  syncTreeExpansion(): void {
    const parsed = this.state.parsed();
    if (parsed) syncExpansion(parsed.tree, parsed.nodeIndex, this.field().hl7Fields);
  }

  saveDefault(value: string | null): void {
    this.state.setFieldDefault(this.field().id, value);
    this.editing.set(false);
  }

  confirmDelete(): void {
    const field = this.field();
    this.confirmation.confirm({
      key: 'mapping',
      header: 'Remove mapping',
      message: `Remove mapping for <em>${escapeHtml(field.label)}</em>?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptIcon: 'pi pi-trash mr-2',
      acceptButtonStyleClass: 'p-button-sm p-button-danger',
      rejectButtonStyleClass: 'p-button-sm p-button-text hl7-btn-navy',
      defaultFocus: 'reject',
      accept: () => this.state.removeField(field.id),
    });
  }
}
