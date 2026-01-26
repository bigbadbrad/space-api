// /utils/marketingEvents.js
const crypto = require('crypto');
const fetch  = require('node-fetch');
const { GoogleAdsApi, resources } = require('google-ads-api');

/* ---------- Meta / Facebook ---------- */
async function sendMetaCapi({ pixelId, accessToken, user, eventId, eventTime }) {
  const url = `https://graph.facebook.com/v19.0/${pixelId}/events`;
  const body = {
    data: [
      {
        event_id: eventId,
        event_name: 'TrialExpired',
        event_time: eventTime,
        action_source: 'system_generated',
        user_data: {
          ph: sha256(user.phone),
          external_id: sha256(String(user.id)),
        },
      },
    ],
  };
  await fetch(url + '?access_token=' + accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ---------- Google Ads ---------- */
async function sendGoogleOffline({ customerId, conversionActionId, user, eventId, eventTime }) {
  // Needs a stored gclid; skip if you don’t have one
  if (!user.gclid) return;

  const client = new GoogleAdsApi({
    client_id: process.env.GADS_CLIENT_ID,
    client_secret: process.env.GADS_CLIENT_SECRET,
    developer_token: process.env.GADS_DEV_TOKEN,
  });

  const customer = client.Customer({
    customer_id: customerId,
    refresh_token: process.env.GADS_REFRESH_TOKEN,
  });

  const conv = new resources.ClickConversion({
    conversion_action: `customers/${customerId}/conversionActions/${conversionActionId}`,
    conversion_date_time: new Date(eventTime * 1000).toISOString(),
    conversion_value: 0.0,
    currency_code: 'USD',
    gclid: user.gclid,
    order_id: eventId, // dedup key
  });

  await customer.conversionUploads.uploadClickConversions({
    conversions: [conv],
    partial_failure: true,
  });
}

/* ---------- Reddit ---------- */
async function sendReddit({ advertiserId, user, eventId, eventTime }) {
  const url = 'https://ads-api.reddit.com/api/v2.0/conversions';
  const body = {
    advertiser_id: advertiserId,
    event_type: 'Other',          // Reddit standard
    event_name: 'TrialExpired',
    event_time: eventTime,
    value: 0,
    currency: 'USD',
    event_id: eventId,
    user_identifiers: [
      { hashed_phone: sha256(user.phone) },
    ],
  };

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REDDIT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/* ---------- util ---------- */
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

module.exports = {
  fireTrialExpired: async (user) => {
    const now = Math.floor(Date.now() / 1000);
    const eventId = sha256(`trial-expired-${user.id}`); // deterministic per user

    try {
      await Promise.all([
        sendMetaCapi({
          pixelId: process.env.META_PIXEL_ID,
          accessToken: process.env.META_CAPI_TOKEN,
          user, eventId, eventTime: now,
        }),
        sendGoogleOffline({
          customerId: process.env.GADS_CID,
          conversionActionId: process.env.GADS_TRIAL_EXPIRED_CA,
          user, eventId, eventTime: now,
        }),
        sendReddit({
          advertiserId: process.env.REDDIT_ADVERTISER_ID,
          user, eventId, eventTime: now,
        }),
      ]);
      console.log(`📤 Sent TrialExpired for user ${user.id}`);
    } catch (err) {
      console.error('⚠️  Marketing event failed', err.toString());
    }
  },
};
