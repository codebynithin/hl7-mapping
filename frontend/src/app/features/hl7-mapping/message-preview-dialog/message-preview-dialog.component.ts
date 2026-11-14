import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { splitSegments } from '../../../core/services/hl7-parser.service';

@Component({
  selector: 'app-message-preview-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="true"
      (visibleChange)="!$event && closed.emit()"
      [modal]="true"
      [dismissableMask]="true"
      [maximizable]="true"
      appendTo="body"
      styleClass="hl7-dialog"
      [style]="{ width: 'min(1100px, 92vw)' }"
      [contentStyle]="{ 'max-height': '70vh' }"
    >
      <ng-template pTemplate="header">
        <span class="hl7-dialog__title">
          {{ name() }}
          <span class="hl7-dialog__meta">{{ lines().length }} segments</span>
        </span>
      </ng-template>
      <pre class="hl7-preview">@for (line of lines(); track $index) {<div class="hl7-preview__line"><span class="hl7-preview__seg">{{ line.id }}</span>{{ line.rest }}</div>}</pre>
    </p-dialog>
  `,
  styles: `
    .hl7-preview {
      margin: 0;
      font-family: 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-all;
      color: #1f2937;
    }
    .hl7-preview__line {
      padding: 1px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .hl7-preview__seg {
      color: var(--hl7-navy);
      font-weight: 700;
    }
  `,
})
export class MessagePreviewDialogComponent {
  readonly name = input<string>('Sample message');
  readonly message = input<string>('');
  readonly closed = output<void>();

  readonly lines = computed(() =>
    splitSegments(this.message()).map((line) => ({ id: line.slice(0, 3), rest: line.slice(3) })),
  );
}
