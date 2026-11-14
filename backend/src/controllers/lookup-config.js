const { COLLECTIONS } = require('../config/db');

/**
 * Aggregation stages that join `org-message-config` by the string `configIdField`
 * and expose `configName` (the config's hl7Mapping name) and `organizationAlias`.
 */
function lookupOrgMessageConfig(configIdField) {
  return [
    {
      $lookup: {
        from: COLLECTIONS.orgMessageConfig,
        let: {
          cfgId: { $convert: { input: configIdField, to: 'objectId', onError: null, onNull: null } },
        },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$cfgId'] } } },
          { $project: { _id: 0, hl7Mapping: 1, organizationAlias: 1 } },
        ],
        as: '_config',
      },
    },
    { $set: { _config: { $arrayElemAt: ['$_config', 0] } } },
    {
      $set: {
        configName: '$_config.hl7Mapping',
        organizationAlias: '$_config.organizationAlias',
      },
    },
    { $unset: '_config' },
  ];
}

const NUMERIC_COLLATION = { locale: 'en', numericOrdering: true };

module.exports = { lookupOrgMessageConfig, NUMERIC_COLLATION };
