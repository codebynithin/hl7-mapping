const { Router } = require('express');
const { listMappings, getMapping } = require('../controllers/hl7-mapping.controller');
const { validateObjectId } = require('../middleware/validate-object-id');

const router = Router();

router.get('/', listMappings);
router.get('/:id', validateObjectId('id'), getMapping);

module.exports = router;
