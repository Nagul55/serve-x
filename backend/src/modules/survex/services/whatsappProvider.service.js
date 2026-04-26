import { env } from '../../../config/env.js';
import { 
  sendMetaWhatsAppMessage, 
  sendMetaWhatsAppDispatch, 
  sendMetaWhatsAppMedia,
  sendMetaWhatsAppLocation,
} from './metaWhatsApp.service.js';

const SUPPORTED_PROVIDER = 'meta';

export function resolveWhatsAppProvider(provider) {
  const requested = String(provider || '').trim().toLowerCase();
  if (requested && requested !== SUPPORTED_PROVIDER) {
    throw new Error(`Unsupported WhatsApp provider: ${requested}`);
  }

  return SUPPORTED_PROVIDER;
}

export function getWhatsAppProviderConfigSummary() {
  const provider = SUPPORTED_PROVIDER;
  const publicNumber = env.servexWhatsAppPublicNumber || '';

  return {
    provider,
    publicNumber,
    providers: {
      meta: {
        configured: Boolean(env.metaWhatsAppAccessToken && env.metaWhatsAppPhoneNumberId),
        apiVersion: env.metaWhatsAppApiVersion,
      },
    },
  };
}

export async function sendWhatsAppMessage({ to, text, interactive, provider }) {
  const resolvedProvider = resolveWhatsAppProvider(provider);

  const providerResponse = await sendMetaWhatsAppMessage({ to, text, interactive });
  return {
    provider: resolvedProvider,
    providerResponse,
  };
}

export async function sendWhatsAppDispatch({ to, text, provider }) {
  const resolvedProvider = resolveWhatsAppProvider(provider);

  const providerResponse = await sendMetaWhatsAppDispatch({ to, assignmentText: text });
  return {
    provider: resolvedProvider,
    providerResponse,
  };
}

export async function sendWhatsAppMedia({ to, mediaUrl, mediaPath, type, caption, provider }) {
  const resolvedProvider = resolveWhatsAppProvider(provider);

  const providerResponse = await sendMetaWhatsAppMedia({ to, mediaUrl, mediaPath, type, caption });
  return {
    provider: resolvedProvider,
    providerResponse,
  };
}

export async function sendWhatsAppLocation({ to, latitude, longitude, name, address, provider }) {
  const resolvedProvider = resolveWhatsAppProvider(provider);

  const providerResponse = await sendMetaWhatsAppLocation({ to, latitude, longitude, name, address });
  return {
    provider: resolvedProvider,
    providerResponse,
  };
}
