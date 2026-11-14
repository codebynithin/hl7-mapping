import { TreeNode } from 'primeng/api';

/** Shapes stored in the `hl7-test-message` collection. */
export interface Hl7MessageSummary {
  _id: string;
  name: string;
  orgMessageConfigId?: string;
  configName?: string;
  organizationAlias?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Hl7MessageDocument extends Hl7MessageSummary {
  /** Raw HL7 v2 message; segments separated by `\r`, `\n` or `\r\n`. */
  message: string;
}

/* ---------- Parser output ---------- */

export interface Hl7Delimiters {
  field: string;
  component: string;
  repetition: string;
  escape: string;
  subcomponent: string;
}

export interface Hl7Segment {
  id: string;
  /** 1-based occurrence of this segment id within the message. */
  occurrence: number;
  /** True when the segment id occurs more than once in the message. */
  repeats: boolean;
  /** `OBX` for the first occurrence, `OBX[2]` for later ones. */
  path: string;
  /** Tree label: `OBX [2]` for repeating segments, otherwise the id. */
  label: string;
  /** `fields[n]` is the raw HL7 field n (`fields[0]` is the segment id). */
  fields: string[];
}

export interface ParsedHl7Message {
  delimiters: Hl7Delimiters;
  segments: Hl7Segment[];
  warnings: string[];
}

export type Hl7NodeKind = 'segment' | 'field' | 'component' | 'subcomponent';

export interface Hl7NodeData {
  path: string;
  value: string;
  kind: Hl7NodeKind;
  /** Numeric position within the parent, used to keep siblings ordered. */
  position: number;
  /** Node was added for a mapped path that does not exist in the sample message. */
  missing?: boolean;
}

export type Hl7TreeNode = TreeNode<Hl7NodeData>;

export interface Hl7Tree {
  tree: Hl7TreeNode[];
  /** Path → node; repeating segments are also indexed as `OBX[1].…`. */
  nodeIndex: Map<string, Hl7TreeNode>;
}

export interface ParsedHl7 extends Hl7Tree {
  valueMap: Map<string, string>;
  warnings: string[];
}
