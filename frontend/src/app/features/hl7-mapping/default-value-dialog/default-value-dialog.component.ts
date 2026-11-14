import { ChangeDetectionStrategy, Component, OnInit, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { AutoFocusModule } from 'primeng/autofocus';

@Component({
  selector: 'app-default-value-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, AutoFocusModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="true"
      (visibleChange)="!$event && cancel.emit()"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [dismissableMask]="true"
      appendTo="body"
      styleClass="hl7-dialog"
      [style]="{ width: '24rem' }"
    >
      <ng-template pTemplate="header">
        <span class="hl7-dialog__title">Default value · <span class="hl7-dialog__subject">{{ variable() }}</span></span>
      </ng-template>

      <form (ngSubmit)="save.emit(normalized())" class="flex flex-column gap-1">
        <label for="default-value-input" class="hl7-dialog__label">Used when the mapped HL7 field(s) are empty</label>
        <input
          id="default-value-input"
          name="defaultValue"
          pInputText
          class="w-full"
          [(ngModel)]="draft"
          pAutoFocus
          [autofocus]="true"
          autocomplete="off"
          placeholder="e.g. ORM"
        />
      </form>

      <ng-template pTemplate="footer">
        <div class="flex align-items-center gap-2">
          <button
            pButton
            type="button"
            label="Clear"
            icon="pi pi-times"
            class="p-button-text p-button-sm hl7-btn-danger mr-auto"
            [disabled]="value() === null"
            (click)="save.emit(null)"
          ></button>
          <button pButton type="button" label="Cancel" class="p-button-text p-button-sm hl7-btn-navy" (click)="cancel.emit()"></button>
          <button pButton type="button" label="Save" icon="pi pi-check" class="p-button-sm hl7-btn-solid" (click)="save.emit(normalized())"></button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class DefaultValueDialogComponent implements OnInit {
  readonly variable = input.required<string>();
  readonly value = input<string | null>(null);

  readonly save = output<string | null>();
  readonly cancel = output<void>();

  draft = '';

  ngOnInit(): void {
    this.draft = this.value() ?? '';
  }

  normalized(): string | null {
    return this.draft === '' ? null : this.draft;
  }
}
