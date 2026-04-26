import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../../config/env.js';
import { normalizeWhatsAppPhone } from './sanitize.js';

export function signSurvexJwt(payload) {
  return jwt.sign(payload, env.survexJwtSecret, { expiresIn: env.survexJwtExpiresIn });
}

export function verifySurvexJwt(token) {
  return jwt.verify(token, env.survexJwtSecret);
}

export function isMetaRequestValid(req) {
  // Re-read at call time so env changes in dev take effect without a full restart
  const skip = process.env.SURVEX_SKIP_META_SIGNATURE_VALIDATION;
  if (skip === 'true' || skip === '1' || skip === 'yes' || env.survexSkipMetaSignatureValidation) {
    return true;
  }

  if (!env.metaAppSecret) {
    return false;
  }

  const signatureHeader = String(req.headers['x-hub-signature-256'] || '').trim();
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  // Use rawBody if captured in server.js, otherwise fallback to stringified body
  const rawPayload = req.rawBody || JSON.stringify(req.body || {});
  const expected = `sha256=${crypto
    .createHmac('sha256', env.metaAppSecret)
    .update(rawPayload)
    .digest('hex')}`;

  const isValid = expected.length === signatureHeader.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));

  if (!isValid && env.nodeEnv !== 'production') {
    console.warn('[Security] Meta signature mismatch.');
    if (!req.rawBody) {
      console.warn('[Security] rawBody was missing, fell back to JSON.stringify which is prone to order issues.');
    }
  }

  return isValid;
}

export const survexAuthRateLimiter = rateLimit({
  windowMs: env.survexAuthRateLimitWindowMinutes * 60 * 1000,
  limit: env.survexAuthRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

export const survexWebhookRateLimiter = rateLimit({
  windowMs: env.survexWebhookRateLimitWindowMinutes * 60 * 1000,
  limit: env.survexWebhookRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  // Primary key is WhatsApp phone number; IP is only a rare fallback.
  // Suppress IPv6 validation since phone-based keying is the norm.
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const from = normalizeWhatsAppPhone(
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from
      || req.body?.from
      || ''
    );
    return from || req.ip || 'unknown';
  },
  message: { error: 'Webhook rate limit exceeded' },
});
