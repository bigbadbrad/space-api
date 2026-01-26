// controllers/api/apiKeyRoutes.js
const router = require('express').Router();
const crypto = require('crypto');
const { ApiKey } = require('../../models');

// Generate an API key for a client
router.post('/', async (req, res) => {
  // Generate a new key
  const apiKey = await ApiKey.create({
    key: crypto.randomBytes(30).toString('hex'),
    client: req.body.client,
  });

  res.json({ apiKey: apiKey.key });
});

module.exports = router;