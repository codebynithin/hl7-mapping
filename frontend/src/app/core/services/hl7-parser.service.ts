import { Injectable } from '@angular/core';
import {
  Hl7Delimiters,
  Hl7NodeData,
  Hl7NodeKind,
  Hl7Segment,
  Hl7Tree,
  Hl7TreeNode,
  ParsedHl7,
  ParsedHl7Message,
} from '../models/hl7-message.model';

/** Every field is padded to at least this many components so blank positions stay mappable. */
export const MIN_COMPONENTS = 5;

export const DEFAULT_DELIMITERS: Readonly<Hl7Delimiters> = {
  field: '|',
  component: '^',
  repetition: '~',
  escape: '\\',
  subcomponent: '&',
};

const SEGMENT_ID = /^[A-Z][A-Z0-9]{2}$/;
const PATH_PATTERN = /^([A-Z][A-Z0-9]{2})(?:\[(\d+)\])?\.(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

export interface Hl7PathParts {
  segment: string;
  occurrence: number;
  field: number;
  component?: number;
  subcomponent?: number;
}

/* ------------------------------------------------------------------ */
/* Message → segments                                                  */
/* ------------------------------------------------------------------ */

export function splitSegments(message: string | null | undefined): string[] {
  const lines = (message ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Some stored samples were flattened with a space between segments instead of a line break.
  if (lines.length === 1) {
    return lines[0].split(/(?<=\|)\s+(?=[A-Z][A-Z0-9]{2}\|)/);
  }
  return lines;
}

export function readDelimiters(segments: string[]): Hl7Delimiters | null {
  const msh = segments.find((s) => s.startsWith('MSH'));
  if (!msh || msh.length < 4) return null;

  const field = msh[3];
  const end = msh.indexOf(field, 4);
  // Some stored samples carry an over-escaped `^~\\&`; collapse it back to `^~\&`.
  const encoding = msh.slice(4, end === -1 ? undefined : end).replace(/\\\\/g, '\\');

  return {
    field,
    component: encoding[0] ?? DEFAULT_DELIMITERS.component,
    repetition: encoding[1] ?? DEFAULT_DELIMITERS.repetition,
    escape: encoding[2] ?? DEFAULT_DELIMITERS.escape,
    subcomponent: encoding[3] ?? DEFAULT_DELIMITERS.subcomponent,
  };
}

export function encodingCharacters(d: Hl7Delimiters): string {
  return d.component + d.repetition + d.escape + d.subcomponent;
}

export function segmentPath(id: string, occurrence: number): string {
  return occurrence > 1 ? `${id}[${occurrence}]` : id;
}

export function parseMessage(message: string | null | undefined): ParsedHl7Message {
  const warnings: string[] = [];
  const lines = splitSegments(message);
  const found = readDelimiters(lines);
  if (!found && lines.length) warnings.push('No MSH segment found; default HL7 delimiters were used.');
  const delimiters = found ?? { ...DEFAULT_DELIMITERS };

  const counts = new Map<string, number>();
  const raw: Array<Pick<Hl7Segment, 'id' | 'occurrence' | 'fields'>> = [];
  let skipped = 0;

  for (const line of lines) {
    const parts = line.split(delimiters.field);
    const id = parts[0];
    if (!SEGMENT_ID.test(id)) {
      skipped++;
      continue;
    }
    const occurrence = (counts.get(id) ?? 0) + 1;
    counts.set(id, occurrence);

    // MSH.1 is the field separator itself and MSH.2 the encoding characters, so every
    // MSH field sits one index to the right of a plain split('|').
    const fields = id === 'MSH' ? [id, delimiters.field, encodingCharacters(delimiters), ...parts.slice(2)] : parts;
    raw.push({ id, occurrence, fields });
  }

  if (skipped) warnings.push(`Skipped ${skipped} line(s) that are not HL7 segments.`);
  if (!raw.length) warnings.push('No HL7 segments found in this message.');

  const segments = raw.map<Hl7Segment>((s) => {
    const repeats = (counts.get(s.id) ?? 0) > 1;
    return {
      ...s,
      repeats,
      path: segmentPath(s.id, s.occurrence),
      label: repeats ? `${s.id} [${s.occurrence}]` : s.id,
    };
  });

  return { delimiters, segments, warnings };
}

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces `\F\ \S\ \T\ \R\ \E\` with the literal delimiters. Display values only. */
export function unescapeHl7(value: string, d: Hl7Delimiters = DEFAULT_DELIMITERS): string {
  if (!value || !value.includes(d.escape)) return value;
  const e = escapeRegExp(d.escape);
  const replacements: Record<string, string> = {
    F: d.field,
    S: d.component,
    T: d.subcomponent,
    R: d.repetition,
    E: d.escape,
  };
  return value.replace(new RegExp(`${e}([FSTRE])${e}`, 'g'), (_, code: string) => replacements[code]);
}

export interface Hl7FieldValue {
  value: string;
  components: Array<{ value: string; subcomponents: string[] }>;
}

export function readField(segment: Hl7Segment, n: number, d: Hl7Delimiters): Hl7FieldValue {
  const raw = segment.fields[n] ?? '';
  if (segment.id === 'MSH' && n <= 2) {
    return { value: raw, components: [] };
  }
  // Field repetitions (`~`): only the first repetition is used for values and tree nodes.
  const first = raw.split(d.repetition)[0];
  return {
    value: unescapeHl7(first, d),
    components: first.split(d.component).map((component) => ({
      value: unescapeHl7(component, d),
      subcomponents: component.split(d.subcomponent).map((s) => unescapeHl7(s, d)),
    })),
  };
}

/** Prefixes a value is indexed under: `OBX` and, for repeating segments, also `OBX[1]`. */
function pathPrefixes(segment: Hl7Segment): string[] {
  return segment.repeats && segment.occurrence === 1 ? [segment.path, `${segment.id}[1]`] : [segment.path];
}

export function buildValueMap(parsed: ParsedHl7Message): Map<string, string> {
  const map = new Map<string, string>();
  for (const segment of parsed.segments) {
    const prefixes = pathPrefixes(segment);
    for (let n = 1; n < segment.fields.length; n++) {
      const field = readField(segment, n, parsed.delimiters);
      for (const prefix of prefixes) {
        map.set(`${prefix}.${n}`, field.value);
        field.components.forEach((component, ci) => {
          map.set(`${prefix}.${n}.${ci + 1}`, component.value);
          component.subcomponents.forEach((sub, si) => map.set(`${prefix}.${n}.${ci + 1}.${si + 1}`, sub));
        });
      }
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Tree                                                                */
/* ------------------------------------------------------------------ */

function createNode(
  path: string,
  kind: Hl7NodeKind,
  position: number,
  value = '',
  extra: Partial<Hl7NodeData> = {},
  label = path,
): Hl7TreeNode {
  const node: Hl7TreeNode = { key: path, label, data: { path, value, kind, position, ...extra } };
  if (kind === 'segment') node.selectable = false;
  return node;
}

function register(index: Map<string, Hl7TreeNode>, node: Hl7TreeNode, alias?: (key: string) => string): void {
  index.set(node.key!, node);
  if (alias) index.set(alias(node.key!), node);
}

function addEmptyComponents(
  fieldNode: Hl7TreeNode,
  from: number,
  to: number,
  index: Map<string, Hl7TreeNode>,
  extra: Partial<Hl7NodeData> = {},
  alias?: (key: string) => string,
): void {
  for (let c = from; c <= to; c++) {
    const node = createNode(`${fieldNode.key}.${c}`, 'component', c, '', extra);
    (fieldNode.children ??= []).push(node);
    register(index, node, alias);
  }
}

export function buildTree(parsed: ParsedHl7Message, minComponents = MIN_COMPONENTS): Hl7Tree {
  const nodeIndex = new Map<string, Hl7TreeNode>();
  const tree: Hl7TreeNode[] = [];

  parsed.segments.forEach((segment, si) => {
    const alias =
      segment.repeats && segment.occurrence === 1
        ? (key: string) => `${segment.id}[1]${key.slice(segment.id.length)}`
        : undefined;
    const segmentNode = createNode(segment.path, 'segment', si, '', {}, segment.label);
    segmentNode.children = [];
    register(nodeIndex, segmentNode, alias);

    for (let n = 1; n < segment.fields.length; n++) {
      const field = readField(segment, n, parsed.delimiters);
      const fieldNode = createNode(`${segment.path}.${n}`, 'field', n, field.value);
      register(nodeIndex, fieldNode, alias);
      segmentNode.children.push(fieldNode);

      if (segment.id === 'MSH' && n <= 2) continue;

      field.components.forEach((component, ci) => {
        const componentNode = createNode(`${fieldNode.key}.${ci + 1}`, 'component', ci + 1, component.value);
        register(nodeIndex, componentNode, alias);
        (fieldNode.children ??= []).push(componentNode);

        if (component.subcomponents.length > 1) {
          componentNode.children = component.subcomponents.map((sub, sj) => {
            const subNode = createNode(`${componentNode.key}.${sj + 1}`, 'subcomponent', sj + 1, sub);
            register(nodeIndex, subNode, alias);
            return subNode;
          });
        }
      });
      addEmptyComponents(fieldNode, field.components.length + 1, minComponents, nodeIndex, {}, alias);
    }
    tree.push(segmentNode);
  });

  return { tree, nodeIndex };
}

/** Normalises a stored `{ segment, field }` pair into a path such as `PID.5.1`. */
export function toHl7Path(segment: string, field: string): string {
  const position = String(field ?? '')
    .trim()
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
  const seg = String(segment ?? '').trim().toUpperCase();
  return position ? `${seg}.${position}` : seg;
}

export function parseHl7Path(path: string): Hl7PathParts | null {
  const m = PATH_PATTERN.exec(path);
  if (!m) return null;
  return {
    segment: m[1],
    occurrence: m[2] ? Number(m[2]) : 1,
    field: Number(m[3]),
    component: m[4] !== undefined ? Number(m[4]) : undefined,
    subcomponent: m[5] !== undefined ? Number(m[5]) : undefined,
  };
}

/** Keys of the ancestors of a path, outermost first: `PID.5.1` → `['PID', 'PID.5']`. */
export function ancestorKeys(path: string): string[] {
  const parts = path.split('.');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('.'));
}

function insertSorted(parent: Hl7TreeNode, node: Hl7TreeNode): void {
  const children = (parent.children ??= []);
  const at = children.findIndex((c) => (c.data?.position ?? 0) > (node.data?.position ?? 0));
  if (at === -1) children.push(node);
  else children.splice(at, 0, node);
}

/**
 * Adds placeholder nodes for mapped paths that the sample message does not contain
 * (absent segments, trailing fields, extra components) so existing selections stay
 * visible and editable. Unparseable paths are ignored.
 */
export function ensurePaths(
  { tree, nodeIndex }: Hl7Tree,
  paths: Iterable<string>,
  minComponents = MIN_COMPONENTS,
): void {
  const missing = { missing: true };

  const ensureChild = (
    parent: Hl7TreeNode,
    key: string,
    kind: Hl7NodeKind,
    position: number,
  ): Hl7TreeNode => {
    let node = nodeIndex.get(key);
    if (!node) {
      node = createNode(key, kind, position, '', missing);
      insertSorted(parent, node);
      register(nodeIndex, node);
      if (kind === 'field') addEmptyComponents(node, 1, minComponents, nodeIndex, missing);
    }
    return node;
  };

  for (const path of paths) {
    if (nodeIndex.has(path)) continue;
    const p = parseHl7Path(path);
    if (!p) continue;

    const segKey = segmentPath(p.segment, p.occurrence);
    let node = nodeIndex.get(segKey);
    if (!node) {
      const label = p.occurrence > 1 ? `${p.segment} [${p.occurrence}]` : p.segment;
      node = createNode(segKey, 'segment', tree.length, '', missing, label);
      node.children = [];
      tree.push(node);
      register(nodeIndex, node);
    }

    node = ensureChild(node, `${segKey}.${p.field}`, 'field', p.field);
    if (p.component !== undefined) {
      node = ensureChild(node, `${node.key}.${p.component}`, 'component', p.component);
      if (p.subcomponent !== undefined) {
        node = ensureChild(node, `${node.key}.${p.subcomponent}`, 'subcomponent', p.subcomponent);
      }
    }
    // `OBX[1].5.1` and `OBX.5.1` are the same node.
    nodeIndex.set(path, node);
  }
}

/** Collapses the whole (shared) tree, then expands only the ancestors of `selectedKeys`. */
export function syncExpansion(
  tree: Hl7TreeNode[],
  nodeIndex: Map<string, Hl7TreeNode>,
  selectedKeys: Iterable<string>,
): void {
  const collapse = (nodes: Hl7TreeNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.expanded) node.expanded = false;
      if (node.children?.length) collapse(node.children);
    }
  };
  collapse(tree);
  for (const key of selectedKeys) {
    const node = nodeIndex.get(key);
    if (!node?.key) continue;
    for (const ancestor of ancestorKeys(node.key)) {
      const parent = nodeIndex.get(ancestor);
      if (parent) parent.expanded = true;
    }
  }
}

export function parseHl7(message: string, extraPaths: Iterable<string> = [], minComponents = MIN_COMPONENTS): ParsedHl7 {
  const parsed = parseMessage(message);
  const built = buildTree(parsed, minComponents);
  ensurePaths(built, extraPaths, minComponents);
  return { ...built, valueMap: buildValueMap(parsed), warnings: parsed.warnings };
}

@Injectable({ providedIn: 'root' })
export class Hl7ParserService {
  parse(message: string, extraPaths: Iterable<string> = []): ParsedHl7 {
    return parseHl7(message, extraPaths);
  }

  segments(message: string): string[] {
    return splitSegments(message);
  }
}
