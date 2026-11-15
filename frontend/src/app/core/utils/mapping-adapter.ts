import {
  EditableMapping,
  Hl7MappingDocument,
  Hl7MappingEntry,
  MappingField,
  MappingSection,
  SegmentVariableGroup,
} from '../models/hl7-mapping.model';
import {
  FALLBACK_SECTION_KEY,
  SECTION_DEFINITIONS,
  SectionDefinition,
} from '../models/mapping-sections';
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

/** Variables already present on the editable mapping, compared case-insensitively. */
export function usedVariableKeys(mapping: EditableMapping | null): Set<string> {
  const keys = new Set<string>();
  const walk = (sections: MappingSection[]): void => {
    for (const section of sections) {
      for (const field of section.fields) {
        const key = field.key.trim().toUpperCase();
        if (key) keys.add(key);
      }
      walk(section.children);
    }
  };
  if (mapping) walk(mapping.sections);
  return keys;
}

/** Name prefixes a section may add: its own prefixes and segment ids, minus anything a child section claims. */
function addablePrefixes(definition: SectionDefinition): Set<string> {
  const claimedByChild = new Set(
    (definition.children ?? []).flatMap((child) => [...child.prefixes, ...child.segments]),
  );
  return new Set(
    [...definition.prefixes, ...definition.segments].filter(
      (prefix) => !claimedByChild.has(prefix),
    ),
  );
}

/** True when the variable name itself starts with one of the section's prefixes or segment ids. */
function variableMatchesSection(variable: string, definition: SectionDefinition): boolean {
  const allowed = addablePrefixes(definition);
  return variablePrefixes(variable).some((prefix) => allowed.has(prefix));
}

function belongsToKnownSection(variable: string): boolean {
  return ALL_DEFINITIONS.some(
    (definition) =>
      definition.key !== FALLBACK_SECTION_KEY && variableMatchesSection(variable, definition),
  );
}

/**
 * Catalog variables the user may still add to this section.
 * Message Header offers only HDR, MSG, and MSH names; Order offers only its own
 * prefixes and segments (ORD, ORDPHY, ORC, OBR, …). A name that matches no
 * section is offered under Other. Names already on the open mapping are omitted.
 */
export function missingVariablesForSection(
  catalog: SegmentVariableGroup[],
  sectionKey: string,
  used: Set<string>,
): string[] {
  const definition = ALL_DEFINITIONS.find((item) => item.key === sectionKey);
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const group of catalog) {
    for (const variable of group.variables) {
      const key = variable.trim().toUpperCase();
      if (!key || seen.has(key) || used.has(key)) continue;
      const related =
        sectionKey === FALLBACK_SECTION_KEY
          ? !belongsToKnownSection(variable)
          : !!definition && variableMatchesSection(variable, definition);
      if (!related) continue;
      seen.add(key);
      missing.push(variable.trim());
    }
  }
  return missing.sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
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
export function toEditableMapping(
  doc: Hl7MappingDocument,
  newId: () => string = createFieldId,
): EditableMapping {
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

/** Flattens the editable view back into the stored `hl7Mappings` shape. */
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

function sectionHasFields(section: MappingSection): boolean {
  return section.fields.length > 0 || section.children.some(sectionHasFields);
}

/** Stable signature of the editable fields, ignoring client-only ids and empty sections. */
export function mappingFingerprint(mapping: EditableMapping): string {
  const walk = (sections: MappingSection[]): unknown[] =>
    sections.filter(sectionHasFields).map((section) => ({
      fields: section.fields.map((field) => ({
        key: field.key,
        hl7Fields: field.hl7Fields,
        defaultValue: field.defaultValue,
        description: field.description ?? null,
      })),
      children: walk(section.children),
    }));
  return JSON.stringify(walk(mapping.sections));
}

/** Labels of fields that have no HL7 path and so cannot be stored. */
export function fieldsMissingPaths(mapping: EditableMapping): string[] {
  const walk = (sections: MappingSection[]): string[] =>
    sections.flatMap((section) => [
      ...section.fields.filter((field) => field.hl7Fields.length === 0).map((field) => field.label),
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

export interface MissingSection {
  key: string;
  label: string;
}

/**
 * Section definitions that are not on the mapping. A child is listed only when
 * its parent is already shown, so adding it has a place to land.
 */
export function missingSections(sections: MappingSection[]): MissingSection[] {
  const present = new Set<string>();
  const walkPresent = (list: MappingSection[]): void => {
    for (const section of list) {
      present.add(section.key);
      walkPresent(section.children);
    }
  };
  walkPresent(sections);

  const missing: MissingSection[] = [];
  const walk = (defs: SectionDefinition[], parentPresent: boolean): void => {
    for (const def of defs) {
      const here = present.has(def.key);
      if (!here && parentPresent) missing.push({ key: def.key, label: def.label });
      if (here) walk(def.children ?? [], true);
    }
  };
  walk(SECTION_DEFINITIONS, true);
  return missing;
}

interface DefinitionSite {
  def: SectionDefinition;
  siblings: SectionDefinition[];
  parentKey: string | null;
}

function findDefinition(key: string): DefinitionSite | null {
  const walk = (defs: SectionDefinition[], parentKey: string | null): DefinitionSite | null => {
    for (const def of defs) {
      if (def.key === key) return { def, siblings: defs, parentKey };
      const nested = walk(def.children ?? [], def.key);
      if (nested) return nested;
    }
    return null;
  };
  return walk(SECTION_DEFINITIONS, null);
}

function insertAmong(
  sections: MappingSection[],
  defs: SectionDefinition[],
  def: SectionDefinition,
): MappingSection[] {
  if (sections.some((section) => section.key === def.key)) return sections;
  const order = defs.findIndex((item) => item.key === def.key);
  const section: MappingSection = {
    key: def.key,
    label: def.label,
    order: order + 1,
    fields: [],
    children: [],
  };
  const rank = new Map(defs.map((item, index) => [item.key, index]));
  return [...sections, section].sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
}

/** Inserts an empty section in definition order. No-op when the key is unknown or already present. */
export function insertSection(sections: MappingSection[], sectionKey: string): MappingSection[] {
  const site = findDefinition(sectionKey);
  if (!site) return sections;
  if (!site.parentKey) return insertAmong(sections, site.siblings, site.def);

  let changed = false;
  const next = sections.map((section) => {
    if (section.key === site.parentKey) {
      const children = insertAmong(section.children, site.siblings, site.def);
      if (children === section.children) return section;
      changed = true;
      return { ...section, children };
    }
    const children = insertSection(section.children, sectionKey);
    if (children === section.children) return section;
    changed = true;
    return { ...section, children };
  });
  return changed ? next : sections;
}
