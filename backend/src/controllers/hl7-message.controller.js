const { collection, COLLECTIONS } = require('../config/db');
const { HttpError } = require('../middleware/http-error');
const { lookupOrgMessageConfig, NUMERIC_COLLATION } = require('./lookup-config');

// A few stored documents use the misspelled `orgMessageconfigId`.
const CONFIG_ID = { $ifNull: ['$orgMessageConfigId', '$orgMessageconfigId'] };

async function listMessages(_req, res, next) {
  try {
    const docs = await collection(COLLECTIONS.messages)
      .aggregate(
        [
          { $project: { name: 1, orgMessageConfigId: CONFIG_ID, createdAt: 1, updatedAt: 1 } },
          ...lookupOrgMessageConfig('$orgMessageConfigId'),
          { $sort: { name: 1, _id: 1 } },
        ],
        { collation: NUMERIC_COLLATION },
      )
      .toArray();
    res.json(docs);
  } catch (err) {
    next(err);
  }
}

async function getMessage(req, res, next) {
  try {
    const [doc] = await collection(COLLECTIONS.messages)
      .aggregate([
        { $match: { _id: req.objectId } },
        { $set: { orgMessageConfigId: CONFIG_ID } },
        { $unset: 'orgMessageconfigId' },
        ...lookupOrgMessageConfig('$orgMessageConfigId'),
      ])
      .toArray();
    if (!doc) throw new HttpError(404, `hl7-test-message ${req.params.id} not found`);
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

module.exports = { listMessages, getMessage };
