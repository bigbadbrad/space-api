// /controllers/api/hooksRoutes.js
const router = require('express').Router();
const { ingestPostHogEvent, verifyPostHogSignature } = require('../../services/abm.service');
const { updateIntentScoreOnNewSignal } = require('../../services/scoring.service');
const { recomputeAccountIntentForProspect } = require('../../abm/jobs/recomputeAccountIntent');
const leadRequestsController = require('../leadRequestsController');

/**
 * POST /api/hooks/posthog
 * Public endpoint for PostHog webhook events
 * Verifies PostHog secret signature before processing
 */
router.post('/posthog', async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-posthog-signature'] || req.headers['x-signature'];
    const secret = process.env.POSTHOG_WEBHOOK_SECRET;

    if (secret && signature) {
      const isValid = verifyPostHogSignature(req.body, signature, secret);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid signature' });
      }
    }

    // PostHog sends events in different formats
    // Handle batch events or single events
    const events = Array.isArray(req.body) ? req.body : [req.body];

    const results = [];

    for (const event of events) {
      try {
        // Extract event data (adjust based on PostHog's actual webhook format)
        const eventData = {
          distinct_id: event.distinct_id || event.properties?.distinct_id,
          ip: event.ip || event.properties?.$ip,
          event: event.event || event.event_name,
          properties: event.properties || {},
          url: event.properties?.$current_url || event.properties?.url,
          timestamp: event.timestamp || event.properties?.$timestamp,
        };

        if (!eventData.distinct_id) {
          console.warn('Missing distinct_id in PostHog event:', event);
          continue;
        }

        // Ingest the event
        const signal = await ingestPostHogEvent(eventData);

        if (signal) {
          // Update intent score asynchronously (don't wait)
          updateIntentScoreOnNewSignal(signal.prospect_company_id)
            .catch(err => console.error('Error updating intent score:', err));
          // Real-time dashboard: update daily_account_intent so account shows immediately
          recomputeAccountIntentForProspect(signal.prospect_company_id)
            .catch(err => console.warn('Real-time ABM update failed:', err?.message || err));

          results.push({ success: true, signal_id: signal.id });
        } else {
          results.push({ success: false, reason: 'Filtered out (low-value signal)' });
        }
      } catch (err) {
        console.error('Error processing individual PostHog event:', err);
        results.push({ success: false, error: err.message });
      }
    }

    res.status(200).json({
      message: 'Events processed',
      results,
    });
  } catch (err) {
    console.error('Error processing PostHog webhook:', err);
    res.status(500).json({ message: 'Server error processing webhook' });
  }
});

// OPTIONAL: verify a shared secret header if you want (recommended)
function verifyLeadRequestSecret(req, res, next) {
  const expected = process.env.LEAD_REQUEST_SECRET;
  if (!expected) return next();
  const got = req.header('x-lead-request-secret');
  if (got !== expected) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// Public ingestion endpoint for lead requests (modal submissions)
router.post('/lead-requests', verifyLeadRequestSecret, leadRequestsController.createLeadRequest);

module.exports = router;
