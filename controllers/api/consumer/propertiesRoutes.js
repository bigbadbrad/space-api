// GET /api/consumer/properties — list active
// POST /api/consumer/properties — create (domain normalized, 409 if duplicate)
const router = require('express').Router();
const { requireInternalUser } = require('../../../middleware/auth.middleware');
const { Property } = require('../../../models');
const { normalizeDomain } = require('../../../utils/consumerDomain');

const PRODUCT_TYPES = ['content', 'marketplace', 'saas', 'other'];

router.get('/', requireInternalUser, async (req, res) => {
  try {
    const list = await Property.findAll({
      where: { is_active: true },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'domain', 'product_type', 'is_active', 'created_at', 'updated_at'],
    });
    return res.json({ properties: list });
  } catch (err) {
    console.error('GET /api/consumer/properties', err);
    return res.status(500).json({ message: 'Failed to list properties' });
  }
});

router.post('/', requireInternalUser, async (req, res) => {
  try {
    const { name, domain: rawDomain, product_type } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'name is required (2–128 chars)' });
    }
    if (name.length < 2 || name.length > 128) {
      return res.status(400).json({ message: 'name must be 2–128 characters' });
    }
    if (!rawDomain || typeof rawDomain !== 'string') {
      return res.status(400).json({ message: 'domain is required' });
    }
    if (/\s/.test(rawDomain)) {
      return res.status(400).json({ message: 'domain must not contain spaces' });
    }
    const domain = normalizeDomain(rawDomain);
    if (!domain) {
      return res.status(400).json({ message: 'domain must be a valid hostname (e.g. 650.dog)' });
    }
    if (!product_type || !PRODUCT_TYPES.includes(String(product_type).toLowerCase())) {
      return res.status(400).json({
        message: 'product_type must be one of: content, marketplace, saas, other',
      });
    }

    const existing = await Property.findOne({ where: { domain } });
    if (existing) {
      return res.status(409).json({ message: 'That domain already exists.' });
    }

    const property = await Property.create({
      name: name.trim(),
      domain,
      product_type: String(product_type).toLowerCase(),
      is_active: true,
    });
    return res.status(201).json({
      property: {
        id: property.id,
        name: property.name,
        domain: property.domain,
        product_type: property.product_type,
        is_active: property.is_active,
        created_at: property.created_at,
        updated_at: property.updated_at,
      },
    });
  } catch (err) {
    console.error('POST /api/consumer/properties', err);
    return res.status(500).json({ message: 'Failed to create property' });
  }
});

module.exports = router;
