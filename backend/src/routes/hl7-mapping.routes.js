const { Router } = require('express');
const {
  listMappings,
  listVariableCatalog,
  getMapping,
  updateMapping,
} = require('../controllers/hl7-mapping.controller');
const { validateObjectId } = require('../middleware/validate-object-id');

const router = Router();

router.get('/', listMappings);
router.get('/variables', listVariableCatalog);
router.get('/:id', validateObjectId('id'), getMapping);
router.put('/:id', validateObjectId('id'), updateMapping);

module.exports = router;
