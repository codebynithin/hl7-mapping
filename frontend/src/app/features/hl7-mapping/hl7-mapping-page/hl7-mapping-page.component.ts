import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DropdownModule } from 'primeng/dropdown';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { Hl7MessageSummary } from '../../../core/models/hl7-message.model';
import { MappingStateService } from '../../../core/services/mapping-state.service';
import { MappingSectionComponent } from '../mapping-section/mapping-section.component';
import { MessagePreviewDialogComponent } from '../message-preview-dialog/message-preview-dialog.component';

interface MessageOption extends Hl7MessageSummary {
  linked: boolean;
}

@Component({
  selector: 'app-hl7-mapping-page',
  standalone: true,
  imports: [
    FormsModule,
    DropdownModule,
    ButtonModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    SkeletonModule,
    ProgressBarModule,
    MappingSectionComponent,
    MessagePreviewDialogComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './hl7-mapping-page.component.html',
  styleUrl: './hl7-mapping-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hl7MappingPageComponent implements OnInit {
  readonly state = inject(MappingStateService);
  private readonly toast = inject(MessageService);

  readonly previewOpen = signal(false);
  readonly skeletonRows = [0, 1, 2, 3, 4, 5];
  readonly skeletonCols = [0, 1, 2, 3];

  /** Messages that belong to the selected mapping's org-message-config are listed first. */
  readonly messageOptions = computed<MessageOption[]>(() => {
    const configId = this.state.mappingDoc()?.orgMessageConfigId;
    const options = this.state.messages().map((m) => ({ ...m, linked: !!configId && m.orgMessageConfigId === configId }));
    return configId ? [...options.filter((o) => o.linked), ...options.filter((o) => !o.linked)] : options;
  });

  readonly warnings = computed(() => this.state.parsed()?.warnings ?? []);

  ngOnInit(): void {
    this.state.loadLists();
  }

  onDeleteMessage(): void {
    // TODO: needs DELETE API (DELETE /api/hl7-message/:id)
  }

  onUpload(): void {
    // TODO: upload a sample HL7 message (needs POST /api/hl7-message)
    this.toast.add({ severity: 'info', summary: 'Upload', detail: 'Uploading messages is not available yet.', life: 3000 });
  }
}
