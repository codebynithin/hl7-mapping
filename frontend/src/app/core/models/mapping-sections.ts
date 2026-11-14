export interface SectionDefinition {
  key: string;
  label: string;
  /** Upper-cased variable prefixes (text before the first `.` or `_`) that belong here. */
  prefixes: string[];
  /** Fallback when the prefix is unknown: the segment of the variable's first HL7 field. */
  segments: string[];
  /** Hidden when it has no fields. */
  optional?: boolean;
  children?: SectionDefinition[];
}

/**
 * Sections shown in the configurator. Variables are placed by prefix first
 * (`PAT.LNAME` → Patient), then by HL7 segment, else into "Other".
 */
export const SECTION_DEFINITIONS: SectionDefinition[] = [
  { key: 'messageHeader', label: 'Message Header', prefixes: ['HDR', 'MSG'], segments: ['MSH'] },
  { key: 'patient', label: 'Patient', prefixes: ['PAT', 'PATACCOUNT', 'CRT', 'MRG'], segments: ['PID', 'PD1', 'MRG', 'Z4M'] },
  {
    key: 'insurance',
    label: 'Insurance',
    prefixes: ['IN1', 'IN2', 'INS', 'ZIN1'],
    segments: ['IN1', 'IN2', 'IN3'],
    children: [{ key: 'guarantor', label: 'Guarantor', prefixes: ['GT1', 'GAR'], segments: ['GT1'] }],
  },
  { key: 'visit', label: 'Visit', prefixes: ['VISIT'], segments: ['PV1', 'PV2'] },
  {
    key: 'order',
    label: 'Order',
    prefixes: ['ORD', 'ORDPHY', 'PNL', 'OBR', 'RPT', 'COPYTO', 'SPM'],
    segments: ['ORC', 'OBR', 'SPM'],
  },
  {
    key: 'tests',
    label: 'Tests',
    prefixes: ['TST', 'PDF', 'LOINC', 'ZPS'],
    segments: ['OBX', 'ZPS'],
    children: [{ key: 'aoes', label: 'AOEs', prefixes: ['OBX'], segments: [] }],
  },
  { key: 'diagnoses', label: 'Diagnoses', prefixes: ['DIA'], segments: ['DG1', 'DG2', 'DG3'] },
  { key: 'notes', label: 'Notes', prefixes: ['CMT', 'NTE'], segments: ['NTE'], optional: true },
  { key: 'other', label: 'Other', prefixes: [], segments: [], optional: true },
];

export const FALLBACK_SECTION_KEY = 'other';
