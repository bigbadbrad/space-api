// /controllers/api/authRoutes.js
// Internal OAuth helpers for X (Twitter) user auth – used by Consumer GTM publisher.

const router = require('express').Router();
const crypto = require('crypto');
const fetch = require('node-fetch');

const redis = require('../../config/redisClient');
const { requireInternalUser } = require('../../middleware/auth.middleware');
const { PublisherSocialAccount } = require('../../models');

const X_AUTH_BASE = process.env.X_AUTH_BASE_URL || 'https://twitter.com';
const X_TOKEN_URL = process.env.X_TOKEN_URL || 'https://api.twitter.com/2/oauth2/token';
const X_REDIRECT_URI = process.env.X_REDIRECT_URI; // must match the callback URL configured in X dev portal

function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generatePkcePair() {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest();
  const codeChallenge = base64UrlEncode(challenge);
  return { codeVerifier, codeChallenge };
}

// GET /api/auth/x/start?property_id=...
// Returns { url } that the frontend should redirect the user to.
router.get('/x/start', requireInternalUser, async (req, res) => {
  try {
    const propertyId = req.query.property_id;
    if (!propertyId) {
      return res.status(400).json({ message: 'property_id is required' });
    }

    const clientId = process.env.X_CLIENT_ID;
    if (!clientId || !X_REDIRECT_URI) {
      return res.status(500).json({ message: 'X OAuth not configured (missing X_CLIENT_ID or X_REDIRECT_URI)' });
    }

    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = base64UrlEncode(crypto.randomBytes(32));

    const redisKey = `x_oauth_state:${state}`;
    const payload = {
      state,
      code_verifier: codeVerifier,
      property_id: propertyId,
      user_id: req.user.id,
      created_at: Date.now(),
    };
    // 10 minute TTL
    await redis.setex(redisKey, 600, JSON.stringify(payload));

    const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: X_REDIRECT_URI,
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `${X_AUTH_BASE}/i/oauth2/authorize?${params.toString()}`;
    return res.json({ url });
  } catch (err) {
    console.error('GET /api/auth/x/start failed', err);
    return res.status(500).json({ message: 'Failed to start X OAuth flow' });
  }
});

// GET /api/auth/x/callback?state=...&code=...
// Called by X after user authorizes. Exchanges code for tokens and stores them on the X social account.
router.get('/x/callback', async (req, res) => {
  const { state, code } = req.query || {};
  if (!state || !code) {
    return res.status(400).send('Missing state or code.');
  }

  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret || !X_REDIRECT_URI) {
    return res.status(500).send('X OAuth not configured.');
  }

  try {
    const redisKey = `x_oauth_state:${state}`;
    const raw = await redis.get(redisKey);
    if (!raw) {
      return res.status(400).send('Invalid or expired state. Please restart the connection flow from SpaceGTM.');
    }
    await redis.del(redisKey);

    const saved = JSON.parse(raw);
    const codeVerifier = saved.code_verifier;
    const propertyId = saved.property_id;

    // Exchange code for tokens
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: X_REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResp = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body,
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error('X token exchange failed', tokenResp.status, errBody);
      return res.status(500).send('Failed to complete X authorization. Please try again.');
    }

    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token;
    const expiresIn = tokenJson.expires_in;
    const scope = tokenJson.scope;
    const tokenType = tokenJson.token_type;

    if (!accessToken) {
      console.error('X token response missing access_token', tokenJson);
      return res.status(500).send('X authorization did not return an access token.');
    }

    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;

    // Optionally fetch user info so we can label the connection
    let xUser = null;
    try {
      const meResp = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (meResp.ok) {
        const meJson = await meResp.json();
        xUser = meJson.data || null;
      }
    } catch (err) {
      console.error('Failed to fetch X user profile', err);
    }

    const displayName = xUser?.username ? `@${xUser.username}` : null;

    const [account, created] = await PublisherSocialAccount.findOrCreate({
      where: { property_id: propertyId, platform: 'x' },
      defaults: {
        property_id: propertyId,
        platform: 'x',
        display_name: displayName,
        is_active: true,
        credentials_json: {
          access_token: accessToken,
          refresh_token: refreshToken || null,
          expires_at: expiresAt,
          scope,
          token_type: tokenType,
          x_user: xUser,
        },
      },
    });

    if (!created) {
      const existing = account.credentials_json || {};
      await account.update({
        display_name: displayName || account.display_name,
        is_active: true,
        credentials_json: {
          ...existing,
          access_token: accessToken,
          refresh_token: refreshToken || existing.refresh_token || null,
          expires_at: expiresAt,
          scope,
          token_type: tokenType,
          x_user: xUser || existing.x_user || null,
        },
      });
    }

    const redirectAfter =
      process.env.X_POST_AUTH_REDIRECT_URL || 'http://localhost:3003/consumer/settings';
    return res.redirect(302, redirectAfter);
  } catch (err) {
    console.error('GET /api/auth/x/callback failed', err);
    return res.status(500).send('Unexpected error completing X authorization.');
  }
});

module.exports = router;

