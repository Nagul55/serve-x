import { Router } from 'express';
import { env } from '../../../config/env.js';
import { processInboundSurveyMessage } from '../services/inboundSurvey.service.js';
import { extractMetaIncomingMessages } from '../services/metaWhatsApp.service.js';
import { sendWhatsAppMessage } from '../services/whatsappProvider.service.js';
import { sanitizeText } from '../utils/sanitize.js';
import { verifyMetaWebhook } from '../middleware/survexAuth.js';
import { survexWebhookRateLimiter } from '../utils/security.js';

const router = Router();

router.get('/whatsapp/meta', (req, res) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  if (mode === 'subscribe' && token && token === env.metaWhatsAppVerifyToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Meta webhook verification failed');
});

router.post('/whatsapp/meta', survexWebhookRateLimiter, verifyMetaWebhook, async (req, res, next) => {
  // Always respond 200 immediately — Meta requires this or it retries the webhook.
  res.status(200).json({ received: true });

  try {
    const messages = extractMetaIncomingMessages(req.body || {});

    if (messages.length === 0) {
      return;
    }

    for (const incoming of messages) {
      if (env.nodeEnv !== 'production') {
        console.log(`[Survex] Meta inbound from ${incoming.from}: ${sanitizeText(incoming.body, 120)}`);
      }

      let reply;
      try {
        reply = await processInboundSurveyMessage({
          from: incoming.from,
          to: incoming.to,
          body: incoming.body,
          messageSid: incoming.messageId,
          messageType: incoming.messageType,
          mediaId: incoming.mediaId,
          location: incoming.location,
        });
      } catch (processError) {
        console.error(`[Survex] Failed to process inbound message from ${incoming.from}:`, processError.message);
        continue;
      }

      if (reply?.skipReply) {
        if (env.nodeEnv !== 'production') {
          console.log(`[Survex] Skipping duplicate inbound message for ${incoming.from} (${incoming.messageId || 'no-id'})`);
        }
        continue;
      }

      const replyText = sanitizeText(reply?.message || 'Unable to process message. Please retry.', 3500);

      try {
        await sendWhatsAppMessage({
          to: incoming.from,
          text: replyText,
          interactive: reply?.type === 'interactive' ? reply.interactive : undefined,
        });

        if (env.nodeEnv !== 'production') {
          console.log(`[Survex] Meta reply to ${incoming.from}: ${sanitizeText(replyText, 160)}`);
        }
      } catch (sendError) {
        // Log the send error but do NOT throw — the survey has already been processed and saved.
        // This is expected in dev when the Meta access token is expired or not configured.
        console.warn(`[Survex] Failed to send reply to ${incoming.from}: ${sendError.message}`);
        if (env.nodeEnv !== 'production') {
          console.log(`[Survex] (Would have replied): ${sanitizeText(replyText, 200)}`);
        }
      }
    }
  } catch (error) {
    console.error('[Survex] Webhook handler error:', error.message);
  }
});


export default router;
