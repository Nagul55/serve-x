import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

// Load root env first, then local fallback.
dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config();

const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  if (typeof value !== 'string') return Boolean(value);
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 4000),
  mongoUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN || 'http://127.0.0.1:5173',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || '',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
  otpPepper: process.env.OTP_PEPPER || process.env.JWT_SECRET || '',
  otpExpiresMinutes: toInt(process.env.OTP_EXPIRES_MINUTES, 10),
  otpLength: toInt(process.env.OTP_LENGTH, 6),
  otpMaxAttempts: toInt(process.env.OTP_MAX_ATTEMPTS, 5),
  otpRateLimitWindowMinutes: toInt(process.env.OTP_RATE_LIMIT_WINDOW_MINUTES, 15),
  otpMaxPerEmailWindow: toInt(process.env.OTP_MAX_PER_EMAIL_WINDOW, 5),
  otpMaxPerIpWindow: toInt(process.env.OTP_MAX_PER_IP_WINDOW, 20),
  exposeDevOtp: toBool(process.env.EXPOSE_DEV_OTP, true),
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: toInt(process.env.SMTP_PORT, 587),
  smtpSecure: toBool(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'ServeX <no-reply@servex.local>',
  survexJwtSecret: process.env.SURVEX_JWT_SECRET || process.env.JWT_SECRET || '',
  survexJwtExpiresIn: process.env.SURVEX_JWT_EXPIRES_IN || '8h',
  survexAuthRateLimitWindowMinutes: toInt(process.env.SURVEX_AUTH_RATE_LIMIT_WINDOW_MINUTES, 15),
  survexAuthRateLimitMax: toInt(process.env.SURVEX_AUTH_RATE_LIMIT_MAX, 20),
  survexWebhookRateLimitWindowMinutes: toInt(process.env.SURVEX_WEBHOOK_RATE_LIMIT_WINDOW_MINUTES, 1),
  survexWebhookRateLimitMax: toInt(process.env.SURVEX_WEBHOOK_RATE_LIMIT_MAX, 60),
  survexWhatsAppProvider: process.env.SURVEX_WHATSAPP_PROVIDER || 'meta',
  servexWhatsAppPublicNumber: process.env.SERVEX_WHATSAPP_PUBLIC_NUMBER || process.env.META_WHATSAPP_DISPLAY_NUMBER || '',
  metaWhatsAppApiVersion: process.env.META_WHATSAPP_API_VERSION || 'v20.0',
  metaWhatsAppBusinessAccountId: process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  metaWhatsAppAccessToken: process.env.META_WHATSAPP_ACCESS_TOKEN || '',
  metaWhatsAppPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
  metaWhatsAppVerifyToken: process.env.META_WHATSAPP_VERIFY_TOKEN || '',
  metaAppId: process.env.META_APP_ID || '',
  metaAppSecret: process.env.META_APP_SECRET || '',
  survexMetaWebhookUrl: process.env.SURVEX_META_WEBHOOK_URL || '',
  survexSkipMetaSignatureValidation: toBool(
    process.env.SURVEX_SKIP_META_SIGNATURE_VALIDATION,
    process.env.NODE_ENV !== 'production'
  ),
  nvidiaApiKey: process.env.NVIDIA_API_KEY || process.env.SERVEX_AI_API_KEY || '',
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  nvidiaModel: process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-flash',
  servexWhatsAppPublicUrl: process.env.SERVEX_WHATSAPP_PUBLIC_URL || `http://127.0.0.1:${toInt(process.env.PORT, 4000)}`,
  servexSetupToken: process.env.SERVEX_SETUP_TOKEN || '',
  servexAutoSeedOnEmptyDb: toBool(
    process.env.SERVEX_AUTO_SEED_ON_EMPTY_DB,
    process.env.NODE_ENV !== 'production'
  ),
};

if (!env.mongoUri) {
  throw new Error('Missing MONGODB_URI in environment variables.');
}

if (!env.jwtSecret) {
  throw new Error('Missing JWT_SECRET in environment variables.');
}

if (!env.refreshTokenSecret) {
  throw new Error('Missing REFRESH_TOKEN_SECRET in environment variables.');
}

if (!env.survexJwtSecret) {
  throw new Error('Missing SURVEX_JWT_SECRET (or JWT_SECRET fallback) in environment variables.');
}
