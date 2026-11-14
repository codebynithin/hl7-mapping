const { collection, COLLECTIONS } = require('../config/db');
const { HttpError } = require('../middleware/http-error');
const { lookupOrgMessageConfig, NUMERIC_COLLATION } = require('./lookup-config');

// Most stored mappings have no `name`; fall back to the linked org-message-config name.
function displayName(doc) {
  if (doc.name) return doc.name;
  if (doc.configName) return doc.configName;
  const kind = [doc.type, doc.direction].filter(Boolean).join(' ') || 'Mapping';
  return `${kind} (${String(doc._id).slice(-6)})`;
}

async function listMappings(_req, res, next) {
  try {
    const docs = await collection(COLLECTIONS.mappings)
      .aggregate(
        [
          {
            $project: {
              name: 1,
              type: 1,
              direction: 1,
              orgId: 1,
              owner: 1,
              orgMessageConfigId: 1,
              updatedAt: 1,
              fieldCount: { $size: { $ifNull: ['$hl7Mappings', []] } },
            },
          },
          ...lookupOrgMessageConfig('$orgMessageConfigId'),
        ],
        { collation: NUMERIC_COLLATION },
      )
      .toArray();

    const result = docs
      .map((doc) => ({ ...doc, displayName: displayName(doc) }))
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'en', { numeric: true, sensitivity: 'base' }),
      );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMapping(req, res, next) {
  try {
    const [doc] = await collection(COLLECTIONS.mappings)
      .aggregate([
        { $match: { _id: req.objectId } },
        ...lookupOrgMessageConfig('$orgMessageConfigId'),
      ])
      .toArray();
    if (!doc) throw new HttpError(404, `hl7-mapping ${req.params.id} not found`);
    res.json({ ...doc, displayName: displayName(doc) });
  } catch (err) {
    next(err);
  }
}

const SEGMENT_PATTERN = /^[A-Z][A-Z0-9]{2}(?:\[\d+\])?$/;
const FIELD_PATTERN = /^\d+(?:\.\d+){0,2}$/;

/** Accepts `{ hl7Mappings }` or a bare array, and returns the stored entry shape. */
function normalizeHl7Mappings(body) {
  const raw = Array.isArray(body) ? body : body?.hl7Mappings;
  if (!Array.isArray(raw)) {
    throw new HttpError(400, 'Request body must be { hl7Mappings: [...] }');
  }

  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new HttpError(400, `hl7Mappings[${index}] must be an object`);
    }

    const segment = String(entry.segment ?? '')
      .trim()
      .toUpperCase();
    const field = String(entry.field ?? '')
      .trim()
      .replace(/\.{2,}/g, '.')
      .replace(/^\.|\.$/g, '');
    const variable = String(entry.variable ?? '').trim();
    const where = `hl7Mappings[${index}]`;

    if (!SEGMENT_PATTERN.test(segment)) {
      throw new HttpError(400, `${where}.segment must be an HL7 segment such as "PID" or "OBX[2]"`);
    }
    if (!FIELD_PATTERN.test(field)) {
      throw new HttpError(400, `${where}.field must be a position such as "5" or "5.1"`);
    }
    if (!variable) {
      throw new HttpError(400, `${where}.variable is required`);
    }

    const normalized = { segment, field, variable };
    if (entry.value !== undefined && entry.value !== null) {
      if (typeof entry.value !== 'string')
        throw new HttpError(400, `${where}.value must be a string`);
      normalized.value = entry.value;
    }
    if (typeof entry.description === 'string' && entry.description.trim()) {
      normalized.description = entry.description.trim();
    }
    return normalized;
  });
}

async function updateMapping(req, res, next) {
  try {
    const hl7Mappings = normalizeHl7Mappings(req.body);
    const updated = await collection(COLLECTIONS.mappings).updateOne(
      { _id: req.objectId },
      { $set: { hl7Mappings, updatedAt: new Date() } },
    );
    if (updated.matchedCount === 0) {
      throw new HttpError(404, `hl7-mapping ${req.params.id} not found`);
    }
  } catch (err) {
    return next(err);
  }
  return getMapping(req, res, next);
}

module.exports = { listMappings, getMapping, updateMapping };
