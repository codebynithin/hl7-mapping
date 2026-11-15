/**
 * Shapes stored in the `hl7-mapping` collection (config-service DB).
 * A mapping is a flat list of `{ segment, field, variable }` entries; the same
 * `variable` may appear several times when it is sourced from several HL7 fields.
 */
export interface Hl7MappingEntry {
  segment: string;
  /** Position inside the segment, e.g. `"5.1"` or `"3"`. */
  field: string;
  variable: string;
  /** Constant/default value applied by the interface engine. */
  value?: string;
  description?: string;
}

export interface Hl7MappingSummary {
  _id: string;
  name?: string;
  /** `name`, else the linked org-message-config name, else type/direction. */
  displayName: string;
  type?: string;
  direction?: string;
  orgId?: string;
  owner?: string;
  orgMessageConfigId?: string;
  configName?: string;
  organizationAlias?: string;
  fieldCount: number;
  updatedAt?: string;
}

/** Distinct mapping variables that occur on one HL7 segment, across every stored mapping. */
export interface SegmentVariableGroup {
  segment: string;
  variables: string[];
}

export interface Hl7MappingDocument extends Omit<Hl7MappingSummary, 'fieldCount'> {
  hl7Mappings: Hl7MappingEntry[];
  createdAt?: string;
}

/* ---------- Client-side editable view model ---------- */

export interface MappingField {
  /** Client-only id, stable for the lifetime of the loaded mapping. */
  id: string;
  /** The mapping variable, e.g. `PAT.LNAME`. */
  key: string;
  label: string;
  description?: string;
  /** HL7 paths such as `PID.5.1` or `OBX[2].5.1`, in selection order. */
  hl7Fields: string[];
  defaultValue: string | null;
}

export interface MappingSection {
  key: string;
  label: string;
  order: number;
  fields: MappingField[];
  children: MappingSection[];
}

export interface EditableMapping {
  id: string;
  displayName: string;
  type?: string;
  direction?: string;
  orgMessageConfigId?: string;
  sections: MappingSection[];
}
