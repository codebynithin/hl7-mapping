import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Hl7MappingDocument,
  Hl7MappingEntry,
  Hl7MappingSummary,
  SegmentVariableGroup,
} from '../models/hl7-mapping.model';
import { Hl7MessageDocument, Hl7MessageSummary } from '../models/hl7-message.model';

@Injectable({ providedIn: 'root' })
export class Hl7ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  listMappings(): Observable<Hl7MappingSummary[]> {
    return this.http.get<Hl7MappingSummary[]>(`${this.base}/hl7-mapping`);
  }

  /** Distinct variables grouped by HL7 segment, taken from every stored mapping. */
  listVariableCatalog(): Observable<SegmentVariableGroup[]> {
    return this.http.get<SegmentVariableGroup[]>(`${this.base}/hl7-mapping/variables`);
  }

  getMapping(id: string): Observable<Hl7MappingDocument> {
    return this.http.get<Hl7MappingDocument>(`${this.base}/hl7-mapping/${encodeURIComponent(id)}`);
  }

  updateMapping(id: string, hl7Mappings: Hl7MappingEntry[]): Observable<Hl7MappingDocument> {
    return this.http.put<Hl7MappingDocument>(`${this.base}/hl7-mapping/${encodeURIComponent(id)}`, {
      hl7Mappings,
    });
  }

  listMessages(): Observable<Hl7MessageSummary[]> {
    return this.http.get<Hl7MessageSummary[]>(`${this.base}/hl7-message`);
  }

  getMessage(id: string): Observable<Hl7MessageDocument> {
    return this.http.get<Hl7MessageDocument>(`${this.base}/hl7-message/${encodeURIComponent(id)}`);
  }
}
