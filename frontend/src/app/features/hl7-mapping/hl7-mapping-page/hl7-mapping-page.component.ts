import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { Hl7MessageSummary } from '../../../core/models/hl7-message.model';
import { MappingStateService } from '../../../core/services/mapping-state.service';
import { missingSections } from '../../../core/utils/mapping-adapter';
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
    InputTextModule,
    OverlayPanelModule,
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
  readonly segmentQuery = signal('');
  private readonly segmentSearch = viewChild<ElementRef<HTMLInputElement>>('segmentSearch');

  /** Sections kept off the page until the user adds them (Notes and Other when empty). */
  readonly missingSegments = computed(() => missingSections(this.state.mapping()?.sections ?? []));
  readonly filteredSegments = computed(() => {
    const term = this.segmentQuery().trim().toUpperCase();
    const items = this.missingSegments();
    return term ? items.filter((section) => section.label.toUpperCase().includes(term)) : items;
  });

  /** Messages that belong to the selected mapping's org-message-config are listed first. */
  readonly messageOptions = computed<MessageOption[]>(() => {
    const configId = this.state.mappingDoc()?.orgMessageConfigId;
    const options = this.state
      .messages()
      .map((m) => ({ ...m, linked: !!configId && m.orgMessageConfigId === configId }));
    return configId
      ? [...options.filter((o) => o.linked), ...options.filter((o) => !o.linked)]
      : options;
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
    this.toast.add({
      severity: 'info',
      summary: 'Upload',
      detail: 'Uploading messages is not available yet.',
      life: 3000,
    });
  }

  openAddSegment(event: Event, panel: OverlayPanel): void {
    this.segmentQuery.set('');
    panel.toggle(event);
  }

  focusSegmentSearch(): void {
    queueMicrotask(() => this.segmentSearch()?.nativeElement.focus());
  }

  addSegment(key: string, panel: OverlayPanel): void {
    if (!this.missingSegments().some((section) => section.key === key)) return;
    this.state.addSection(key);
    panel.hide();
  }
}
