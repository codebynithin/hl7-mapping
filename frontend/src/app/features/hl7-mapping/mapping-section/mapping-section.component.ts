import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { TooltipModule } from 'primeng/tooltip';
import { MappingSection } from '../../../core/models/hl7-mapping.model';
import { MappingStateService } from '../../../core/services/mapping-state.service';
import {
  countFields,
  missingVariablesForSection,
  usedVariableKeys,
} from '../../../core/utils/mapping-adapter';
import { MappingFieldComponent } from '../mapping-field/mapping-field.component';

const INITIALLY_EXPANDED = new Set(['messageHeader']);

@Component({
  selector: 'app-mapping-section',
  standalone: true,
  imports: [
    ButtonModule,
    InputTextModule,
    OverlayPanelModule,
    TooltipModule,
    MappingFieldComponent,
  ],
  templateUrl: './mapping-section.component.html',
  styleUrl: './mapping-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MappingSectionComponent implements OnInit {
  readonly section = input.required<MappingSection>();
  readonly depth = input(0);

  private readonly state = inject(MappingStateService);

  readonly expanded = signal(false);
  readonly total = computed(() => countFields(this.section()));

  /** Variables known for this section that the open mapping does not already use. */
  readonly missing = computed(() =>
    missingVariablesForSection(
      this.state.variableCatalog(),
      this.section().key,
      usedVariableKeys(this.state.mapping()),
    ),
  );
  readonly query = signal('');
  readonly filtered = computed(() => {
    const term = this.query().trim().toUpperCase();
    const items = this.missing();
    return term ? items.filter((variable) => variable.toUpperCase().includes(term)) : items;
  });
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  ngOnInit(): void {
    this.expanded.set(
      INITIALLY_EXPANDED.has(this.section().key) ||
        this.state.focusSection() === this.section().key,
    );
  }

  toggle(): void {
    this.expanded.update((v) => !v);
  }

  openAdd(event: Event, panel: OverlayPanel): void {
    this.query.set('');
    panel.toggle(event);
  }

  focusSearch(): void {
    queueMicrotask(() => this.search()?.nativeElement.focus());
  }

  addVariable(variable: string, panel: OverlayPanel): void {
    if (!this.missing().includes(variable)) return;
    this.state.addField(this.section().key, variable);
    this.expanded.set(true);
    panel.hide();
  }
}
