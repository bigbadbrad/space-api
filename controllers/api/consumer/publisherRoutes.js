// /api/consumer/publisher — posts, import-json, accounts
const router = require('express').Router();
const { requireInternalUser } = require('../../../middleware/auth.middleware');
const {
  Property,
  PublisherPost,
  PublisherSocialAccount,
  PublisherPublishAttempt,
} = require('../../../models');
const { addPublishJob } = require('../../../queues/publisherPublishQueue');
const { Op } = require('sequelize');

const PLATFORMS = ['x', 'facebook', 'instagram'];
const STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'canceled'];

function validatePlatform(platform) {
  return PLATFORMS.includes(String(platform).toLowerCase());
}

function validateStatus(status) {
  return STATUSES.includes(String(status).toLowerCase());
}

function instagramRequiresMedia(platform, mediaUrls) {
  if (String(platform).toLowerCase() !== 'instagram') return true;
  return Array.isArray(mediaUrls) && mediaUrls.length > 0;
}

// ----- Posts -----

// GET /posts?property_id= & optional status, platform, from, to
router.get('/posts', requireInternalUser, async (req, res) => {
  try {
    const property_id = req.query.property_id;
    if (!property_id) return res.status(400).json({ message: 'property_id is required' });

    const where = { property_id };
    if (req.query.status) {
      if (!validateStatus(req.query.status)) return res.status(400).json({ message: 'Invalid status' });
      where.status = req.query.status;
    }
    if (req.query.platform) {
      if (!validatePlatform(req.query.platform)) return res.status(400).json({ message: 'Invalid platform' });
      where.platform = req.query.platform.toLowerCase();
    }
    if (req.query.from || req.query.to) {
      where.scheduled_for = where.scheduled_for || {};
      if (req.query.from) where.scheduled_for[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.scheduled_for[Op.lte] = new Date(req.query.to);
    }

    const posts = await PublisherPost.findAll({
      where,
      order: [['scheduled_for', 'ASC'], ['created_at', 'DESC']],
      attributes: [
        'id', 'property_id', 'platform', 'text', 'media_urls', 'status',
        'scheduled_for', 'published_at', 'platform_post_id', 'error_message',
        'source', 'source_key', 'created_at', 'updated_at',
      ],
    });
    return res.json({ posts });
  } catch (err) {
    console.error('GET /api/consumer/publisher/posts', err);
    return res.status(500).json({ message: 'Failed to list posts' });
  }
});

// POST /posts — create draft
router.post('/posts', requireInternalUser, async (req, res) => {
  try {
    const { property_id, platform, text, media_urls } = req.body || {};
    if (!property_id) return res.status(400).json({ message: 'property_id is required' });
    if (!platform || !validatePlatform(platform)) return res.status(400).json({ message: 'platform must be x, facebook, or instagram' });
    if (!text || typeof text !== 'string') return res.status(400).json({ message: 'text is required' });

    const post = await PublisherPost.create({
      property_id,
      platform: platform.toLowerCase(),
      text: text.trim(),
      media_urls: Array.isArray(media_urls) ? media_urls : [],
      status: 'draft',
      source: 'ui',
      source_key: null,
    });
    return res.status(201).json({ post: post.toJSON() });
  } catch (err) {
    console.error('POST /api/consumer/publisher/posts', err);
    return res.status(500).json({ message: 'Failed to create post' });
  }
});

// POST /posts/:id/schedule
router.post('/posts/:id/schedule', requireInternalUser, async (req, res) => {
  try {
    const post = await PublisherPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.status !== 'draft' && post.status !== 'scheduled') {
      return res.status(400).json({ message: 'Only draft or scheduled posts can be (re)scheduled' });
    }
    const scheduled_for = req.body?.scheduled_for ? new Date(req.body.scheduled_for) : null;
    if (!scheduled_for || isNaN(scheduled_for.getTime())) {
      return res.status(400).json({ message: 'scheduled_for (ISO datetime) is required' });
    }
    if (!instagramRequiresMedia(post.platform, post.media_urls)) {
      return res.status(400).json({ message: 'Instagram requires at least one media_url' });
    }

    await post.update({ status: 'scheduled', scheduled_for, error_message: null });

    const delay = Math.max(0, scheduled_for.getTime() - Date.now());
    await addPublishJob({ post_id: post.id }, { delay });
    return res.json({ post: post.toJSON() });
  } catch (err) {
    console.error('POST /api/consumer/publisher/posts/:id/schedule', err);
    return res.status(500).json({ message: 'Failed to schedule post' });
  }
});

// POST /posts/:id/publish-now
router.post('/posts/:id/publish-now', requireInternalUser, async (req, res) => {
  try {
    const post = await PublisherPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.status !== 'draft' && post.status !== 'scheduled' && post.status !== 'failed') {
      return res.status(400).json({ message: 'Only draft, scheduled, or failed posts can be published now' });
    }
    if (!instagramRequiresMedia(post.platform, post.media_urls)) {
      return res.status(400).json({ message: 'Instagram requires at least one media_url' });
    }

    await post.update({ status: 'publishing', error_message: null });
    await addPublishJob({ post_id: post.id }, {});
    return res.json({ post: post.toJSON() });
  } catch (err) {
    console.error('POST /api/consumer/publisher/posts/:id/publish-now', err);
    return res.status(500).json({ message: 'Failed to enqueue publish' });
  }
});

// POST /posts/:id/cancel
router.post('/posts/:id/cancel', requireInternalUser, async (req, res) => {
  try {
    const post = await PublisherPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.status !== 'scheduled') return res.status(400).json({ message: 'Only scheduled posts can be canceled' });
    await post.update({ status: 'canceled' });
    return res.json({ post: post.toJSON() });
  } catch (err) {
    console.error('POST /api/consumer/publisher/posts/:id/cancel', err);
    return res.status(500).json({ message: 'Failed to cancel post' });
  }
});

// DELETE /posts/:id
router.delete('/posts/:id', requireInternalUser, async (req, res) => {
  try {
    const post = await PublisherPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (!['draft', 'failed', 'canceled', 'publishing'].includes(post.status)) {
      return res.status(400).json({ message: 'Only draft, failed, canceled, or publishing posts can be deleted' });
    }
    await post.destroy();
    return res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/consumer/publisher/posts/:id', err);
    return res.status(500).json({ message: 'Failed to delete post' });
  }
});

// PATCH /posts/:id
router.patch('/posts/:id', requireInternalUser, async (req, res) => {
  try {
    const post = await PublisherPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.status === 'published') return res.status(400).json({ message: 'Cannot edit published post' });
    if (post.status === 'publishing') return res.status(400).json({ message: 'Post is currently publishing' });

    const updates = {};
    if (req.body.text !== undefined) updates.text = String(req.body.text).trim();
    if (req.body.media_urls !== undefined) updates.media_urls = Array.isArray(req.body.media_urls) ? req.body.media_urls : [];
    if (req.body.scheduled_for !== undefined) {
      const d = new Date(req.body.scheduled_for);
      if (!isNaN(d.getTime())) updates.scheduled_for = d;
    }
    if (Object.keys(updates).length) await post.update(updates);
    return res.json({ post: (await post.reload()).toJSON() });
  } catch (err) {
    console.error('PATCH /api/consumer/publisher/posts/:id', err);
    return res.status(500).json({ message: 'Failed to update post' });
  }
});

// ----- Import JSON -----
// POST /import-json
router.post('/import-json', requireInternalUser, async (req, res) => {
  try {
    const { property_id, items } = req.body || {};
    if (!property_id) return res.status(400).json({ message: 'property_id is required' });
    if (!Array.isArray(items)) return res.status(400).json({ message: 'items must be an array' });

    const result = { created: 0, updated: 0, skipped_published: 0, skipped_publishing: 0, errors: [] };

    for (const item of items) {
      const key = item.key;
      if (!key || typeof key !== 'string') {
        result.errors.push({ key: key || '?', message: 'key is required' });
        continue;
      }
      const platform = item.platform ? String(item.platform).toLowerCase() : '';
      if (!validatePlatform(platform)) {
        result.errors.push({ key, message: 'platform must be x, facebook, or instagram' });
        continue;
      }
      const scheduled_for = item.scheduled_for ? new Date(item.scheduled_for) : null;
      if (!scheduled_for || isNaN(scheduled_for.getTime())) {
        result.errors.push({ key, message: 'scheduled_for must be a valid ISO datetime' });
        continue;
      }
      const text = item.text != null ? String(item.text) : '';
      const media_urls = Array.isArray(item.media_urls) ? item.media_urls : [];
      if (platform === 'instagram' && media_urls.length === 0) {
        result.errors.push({ key, message: 'Instagram requires at least one media_url' });
        continue;
      }

      const [existing] = await PublisherPost.findAll({
        where: { property_id, source: 'json', source_key: key },
        limit: 1,
      });

      if (existing) {
        if (existing.status === 'published') {
          result.skipped_published += 1;
          continue;
        }
        if (existing.status === 'publishing') {
          result.skipped_publishing += 1;
          continue;
        }
        await existing.update({
          platform,
          scheduled_for,
          text,
          media_urls,
          status: 'scheduled',
        });
        result.updated += 1;
        const delay = Math.max(0, scheduled_for.getTime() - Date.now());
        await addPublishJob({ post_id: existing.id }, { delay });
      } else {
        const created = await PublisherPost.create({
          property_id,
          platform,
          text,
          media_urls,
          status: 'scheduled',
          scheduled_for,
          source: 'json',
          source_key: key,
        });
        result.created += 1;
        const delay = Math.max(0, scheduled_for.getTime() - Date.now());
        await addPublishJob({ post_id: created.id }, { delay });
      }
    }

    return res.json(result);
  } catch (err) {
    console.error('POST /api/consumer/publisher/import-json', err);
    return res.status(500).json({ message: 'Failed to import' });
  }
});

// ----- Accounts -----
// GET /accounts?property_id=
router.get('/accounts', requireInternalUser, async (req, res) => {
  try {
    const property_id = req.query.property_id;
    if (!property_id) return res.status(400).json({ message: 'property_id is required' });

    const accounts = await PublisherSocialAccount.findAll({
      where: { property_id },
      attributes: ['id', 'property_id', 'platform', 'display_name', 'credentials_json', 'is_active', 'created_at', 'updated_at'],
    });
    return res.json({ accounts });
  } catch (err) {
    console.error('GET /api/consumer/publisher/accounts', err);
    return res.status(500).json({ message: 'Failed to list accounts' });
  }
});

// PUT /accounts/:platform
router.put('/accounts/:platform', requireInternalUser, async (req, res) => {
  try {
    const platform = req.params.platform ? String(req.params.platform).toLowerCase() : '';
    if (!validatePlatform(platform)) return res.status(400).json({ message: 'platform must be x, facebook, or instagram' });

    const { property_id, display_name, credentials_json, is_active } = req.body || {};
    if (!property_id) return res.status(400).json({ message: 'property_id is required' });
    if (credentials_json === undefined || credentials_json === null) {
      return res.status(400).json({ message: 'credentials_json is required' });
    }

    const [account] = await PublisherSocialAccount.findOrCreate({
      where: { property_id, platform },
      defaults: {
        property_id,
        platform,
        display_name: display_name != null ? String(display_name) : null,
        credentials_json: typeof credentials_json === 'object' ? credentials_json : {},
        is_active: is_active !== false,
      },
    });

    if (!account.isNewRecord) {
      await account.update({
        display_name: display_name != null ? String(display_name) : account.display_name,
        credentials_json: typeof credentials_json === 'object' ? credentials_json : account.credentials_json,
        is_active: is_active !== false,
      });
    }

    return res.json({
      account: {
        id: account.id,
        property_id: account.property_id,
        platform: account.platform,
        display_name: account.display_name,
        is_active: account.is_active,
        created_at: account.created_at,
        updated_at: account.updated_at,
      },
    });
  } catch (err) {
    console.error('PUT /api/consumer/publisher/accounts/:platform', err);
    return res.status(500).json({ message: 'Failed to save account' });
  }
});

module.exports = router;
