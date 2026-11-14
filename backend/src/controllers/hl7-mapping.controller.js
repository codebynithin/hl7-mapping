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
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { numeric: true, sensitivity: 'base' }));

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMapping(req, res, next) {
  try {
    const [doc] = await collection(COLLECTIONS.mappings)
      .aggregate([{ $match: { _id: req.objectId } }, ...lookupOrgMessageConfig('$orgMessageConfigId')])
      .toArray();
    if (!doc) throw new HttpError(404, `hl7-mapping ${req.params.id} not found`);
    res.json({ ...doc, displayName: displayName(doc) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMappings, getMapping };
