import {
  EditableMapping,
  Hl7MappingDocument,
  Hl7MappingEntry,
  MappingField,
  MappingSection,
} from '../models/hl7-mapping.model';
import { FALLBACK_SECTION_KEY, SECTION_DEFINITIONS, SectionDefinition } from '../models/mapping-sections';
import { toHl7Path } from '../services/hl7-parser.service';

let fieldSeq = 0;
export const createFieldId = (): string => `f${++fieldSeq}`;

function flatten(defs: SectionDefinition[]): SectionDefinition[] {
  return defs.flatMap((d) => [d, ...flatten(d.children ?? [])]);
}

const ALL_DEFINITIONS = flatten(SECTION_DEFINITIONS);

function variablePrefixes(variable: string): string[] {
  const head = variable.trim().split('.')[0].toUpperCase();
  return [head, head.split('_')[0]];
}

/** Section key for a variable: by variable prefix, then by HL7 segment, else "other". */
export function sectionKeyFor(variable: string, segment?: string): string {
  for (const prefix of variablePrefixes(variable)) {
    const byPrefix = ALL_DEFINITIONS.find((d) => d.prefixes.includes(prefix));
    if (byPrefix) return byPrefix.key;
  }
  const seg = segment?.trim().toUpperCase();
  const bySegment = seg ? ALL_DEFINITIONS.find((d) => d.segments.includes(seg)) : undefined;
  return bySegment?.key ?? FALLBACK_SECTION_KEY;
}

/** All HL7 paths referenced by a stored mapping (used to pad the sample-message tree). */
export function mappingPaths(doc: Pick<Hl7MappingDocument, 'hl7Mappings'>): string[] {
  return [...new Set((doc.hl7Mappings ?? []).map((e) => toHl7Path(e.segment, e.field)))];
}

/**
 * Builds the editable, sectioned view of a stored mapping.
 * Entries sharing a variable and value become one field with several `hl7Fields`;
 * entries with the same variable but different constants (e.g. `HDR.TEMP`) stay separate.
 */
export function toEditableMapping(doc: Hl7MappingDocument, newId: () => string = createFieldId): EditableMapping {
  const grouped = new Map<string, { field: MappingField; segment: string }>();

  for (const entry of doc.hl7Mappings ?? []) {
    const variable = entry.variable ?? '';
    const value = entry.value ?? null;
    const groupKey = `${variable}\u0000${value ?? ''}`;
    const path = toHl7Path(entry.segment, entry.field);

    const existing = grouped.get(groupKey);
    if (existing) {
      if (!existing.field.hl7Fields.includes(path)) existing.field.hl7Fields.push(path);
      existing.field.description ||= entry.description?.trim() || undefined;
      continue;
    }
    grouped.set(groupKey, {
      segment: entry.segment,
      field: {
        id: newId(),
        key: variable,
        label: variable.trim(),
        description: entry.description?.trim() || undefined,
        hl7Fields: [path],
        defaultValue: value,
      },
    });
  }

  const bySection = new Map<string, MappingField[]>();
  for (const { field, segment } of grouped.values()) {
    const key = sectionKeyFor(field.key, segment);
    bySection.set(key, [...(bySection.get(key) ?? []), field]);
  }

  const build = (defs: SectionDefinition[]): MappingSection[] =>
    defs
      .map((def, i) => ({
        key: def.key,
        label: def.label,
        order: i + 1,
        fields: bySection.get(def.key) ?? [],
        children: build(def.children ?? []),
      }))
      .filter((s, i) => !defs[i].optional || s.fields.length > 0);

  return {
    id: doc._id,
    displayName: doc.displayName ?? doc.name ?? doc._id,
    type: doc.type,
    direction: doc.direction,
    orgMessageConfigId: doc.orgMessageConfigId,
    sections: build(SECTION_DEFINITIONS),
  };
}

/** Flattens the editable view back into the stored `hl7Mappings` shape (for a future PUT). */
export function toHl7MappingEntries(mapping: EditableMapping): Hl7MappingEntry[] {
  const walk = (sections: MappingSection[]): Hl7MappingEntry[] =>
    sections.flatMap((section) => [
      ...section.fields.flatMap((field) =>
        field.hl7Fields.map((path) => {
          const dot = path.indexOf('.');
          const entry: Hl7MappingEntry = {
            segment: dot === -1 ? path : path.slice(0, dot),
            field: dot === -1 ? '' : path.slice(dot + 1),
            variable: field.key,
          };
          if (field.defaultValue !== null) entry.value = field.defaultValue;
          if (field.description) entry.description = field.description;
          return entry;
        }),
      ),
      ...walk(section.children),
    ]);
  return walk(mapping.sections);
}

/* ---------- Immutable updates (unchanged branches keep their identity) ---------- */

export function updateFieldInSections(
  sections: MappingSection[],
  fieldId: string,
  update: (field: MappingField) => MappingField | null,
): MappingSection[] {
  let changed = false;
  const next = sections.map((section) => {
    const idx = section.fields.findIndex((f) => f.id === fieldId);
    if (idx !== -1) {
      changed = true;
      const updated = update(section.fields[idx]);
      const fields = updated
        ? section.fields.map((f, i) => (i === idx ? updated : f))
        : section.fields.filter((_, i) => i !== idx);
      return { ...section, fields };
    }
    const children = updateFieldInSections(section.children, fieldId, update);
    if (children !== section.children) {
      changed = true;
      return { ...section, children };
    }
    return section;
  });
  return changed ? next : sections;
}

export function addFieldToSection(
  sections: MappingSection[],
  sectionKey: string,
  field: MappingField,
): MappingSection[] {
  let changed = false;
  const next = sections.map((section) => {
    if (section.key === sectionKey) {
      changed = true;
      return { ...section, fields: [...section.fields, field] };
    }
    const children = addFieldToSection(section.children, sectionKey, field);
    if (children !== section.children) {
      changed = true;
      return { ...section, children };
    }
    return section;
  });
  return changed ? next : sections;
}

export function countFields(section: MappingSection): number {
  return section.fields.length + section.children.reduce((n, c) => n + countFields(c), 0);
}
