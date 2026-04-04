/**
 * Consumer GTM — execute one publisher post (load post, credentials, call platform, update post + attempts)
 * Spec: consumer-gtm-properties-publisher-v1.md §5.3, §6
 * v1: platform publish is stubbed; sets status + platform_post_id or failed.
 */
const {
  PublisherPost,
  PublisherSocialAccount,
  PublisherPublishAttempt,
} = require('../models');
const fetch = require('node-fetch');

const PLATFORMS = ['x', 'facebook', 'instagram'];

async function publishToPlatform(platform, text, mediaUrls, credentials) {
  if (!PLATFORMS.includes(platform)) throw new Error(`Unknown platform: ${platform}`);

  // For now, only implement real publishing for X; others remain stubbed.
  if (platform !== 'x') {
    return { platform_post_id: `stub-${platform}-${Date.now()}` };
  }

  const accessToken = credentials?.access_token;
  if (!accessToken) {
    throw new Error('Missing X access token');
  }

  // Simple v1: text-only tweet; ignore media_urls for now.
  const body = { text };

  const resp = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const msg = data?.error || data?.title || data?.detail || resp.statusText || 'Failed to publish tweet';
    throw new Error(`X publish failed (${resp.status}): ${msg}`);
  }

  const id = data?.data?.id;
  if (!id) {
    throw new Error('X publish response missing tweet id');
  }

  return { platform_post_id: id };
}

/**
 * @param {{ post_id: string }} payload
 * @returns {{ success: boolean, platform_post_id?: string, error_message?: string }}
 */
async function runPublishPublisherPost(payload) {
  const { post_id } = payload || {};
  if (!post_id) throw new Error('post_id required');

  const post = await PublisherPost.findByPk(post_id);
  if (!post) throw new Error('Post not found');
  if (!['scheduled', 'publishing'].includes(post.status)) {
    return { success: false, skipped: true, reason: 'status not scheduled/publishing' };
  }
  const scheduledFor = post.scheduled_for ? new Date(post.scheduled_for).getTime() : 0;
  if (post.status === 'scheduled' && scheduledFor > Date.now()) {
    return { success: false, skipped: true, reason: 'scheduled_for in future' };
  }

  await post.update({ status: 'publishing' });

  const account = await PublisherSocialAccount.findOne({
    where: { property_id: post.property_id, platform: post.platform, is_active: true },
  });
  if (!account) {
    await post.update({
      status: 'failed',
      error_message: `Missing credentials for ${post.platform}`,
    });
    await PublisherPublishAttempt.create({
      post_id: post.id,
      attempt_number: 1,
      started_at: new Date(),
      finished_at: new Date(),
      result: 'failed',
      error_message: 'Missing credentials',
    });
    return { success: false, error_message: 'Missing credentials' };
  }

  const attemptNumber = (await PublisherPublishAttempt.count({ where: { post_id: post.id } })) + 1;
  const startedAt = new Date();
  let result = 'failed';
  let errorMessage = null;
  let platformPostId = null;

  try {
    const out = await publishToPlatform(
      post.platform,
      post.text,
      post.media_urls || [],
      account.credentials_json || {}
    );
    platformPostId = out.platform_post_id;
    result = 'success';
  } catch (err) {
    errorMessage = err.message || String(err);
  }

  const finishedAt = new Date();
  await PublisherPublishAttempt.create({
    post_id: post.id,
    attempt_number: attemptNumber,
    started_at: startedAt,
    finished_at: finishedAt,
    result,
    error_message: errorMessage,
  });

  if (result === 'success') {
    await post.update({
      status: 'published',
      published_at: finishedAt,
      platform_post_id: platformPostId,
      error_message: null,
    });
    return { success: true, platform_post_id: platformPostId };
  }

  await post.update({
    status: 'failed',
    error_message: errorMessage,
  });
  return { success: false, error_message: errorMessage };
}

module.exports = { runPublishPublisherPost };
