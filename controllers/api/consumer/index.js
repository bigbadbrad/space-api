// /api/consumer — properties + publisher
const router = require('express').Router();
const propertiesRoutes = require('./propertiesRoutes');
const publisherRoutes = require('./publisherRoutes');

router.use('/properties', propertiesRoutes);
router.use('/publisher', publisherRoutes);

module.exports = router;
