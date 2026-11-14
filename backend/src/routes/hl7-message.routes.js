const { Router } = require('express');
const { listMessages, getMessage } = require('../controllers/hl7-message.controller');
const { validateObjectId } = require('../middleware/validate-object-id');

const router = Router();

router.get('/', listMessages);
router.get('/:id', validateObjectId('id'), getMessage);

module.exports = router;
