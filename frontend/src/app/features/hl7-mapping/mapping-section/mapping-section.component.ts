import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoFocusModule } from 'primeng/autofocus';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { MappingSection } from '../../../core/models/hl7-mapping.model';
import { MappingStateService } from '../../../core/services/mapping-state.service';
import { countFields } from '../../../core/utils/mapping-adapter';
import { MappingFieldComponent } from '../mapping-field/mapping-field.component';

const INITIALLY_EXPANDED = new Set(['messageHeader']);

@Component({
  selector: 'app-mapping-section',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, AutoFocusModule, TooltipModule, MappingFieldComponent],
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

  readonly adding = signal(false);
  newVariable = '';
  readonly duplicate = signal(false);

  ngOnInit(): void {
    this.expanded.set(INITIALLY_EXPANDED.has(this.section().key));
  }

  toggle(): void {
    this.expanded.update((v) => !v);
  }

  openAdd(): void {
    this.newVariable = '';
    this.duplicate.set(false);
    this.adding.set(true);
  }

  onVariableInput(value: string): void {
    this.duplicate.set(this.state.hasVariable(value));
  }

  confirmAdd(): void {
    const variable = this.newVariable.trim();
    if (!variable) return;
    this.state.addField(this.section().key, variable);
    this.adding.set(false);
    this.expanded.set(true);
  }
}
