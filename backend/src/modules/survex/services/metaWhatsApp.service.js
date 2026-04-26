import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../../config/env.js';
import { normalizeWhatsAppPhone, sanitizeText } from '../utils/sanitize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../../../../public/uploads');

const MEDIA_MIME_TYPES = {
  image: 'image/jpeg',
  document: 'application/pdf',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOutboundPhone(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

export function extractMetaIncomingMessages(payload) {
  const messages = [];

  for (const entry of asArray(payload?.entry)) {
    for (const change of asArray(entry?.changes)) {
      const value = change?.value || {};
      const to = normalizeWhatsAppPhone(value?.metadata?.display_phone_number || '');

      for (const msg of asArray(value?.messages)) {
        const from = normalizeWhatsAppPhone(msg?.from || '');
        if (!from) continue;

        const messageType = sanitizeText(msg?.type || 'unknown', 40) || 'unknown';

        let text = '';
        let mediaId = '';
        let location = null;

        if (messageType === 'text') {
          text = sanitizeText(msg?.text?.body || '', 3000);
        } else if (messageType === 'image') {
          text = sanitizeText(msg?.image?.caption || '[photo]', 3000);
          mediaId = sanitizeText(msg?.image?.id || '', 200);
        } else if (messageType === 'interactive') {
          text = sanitizeText(
            msg?.interactive?.button_reply?.title
            || msg?.interactive?.list_reply?.title
            || msg?.interactive?.button_reply?.id
            || msg?.interactive?.list_reply?.id
            || '',
            3000
          );
        } else if (messageType === 'location') {
          text = '[location]';
          location = {
            latitude: msg?.location?.latitude,
            longitude: msg?.location?.longitude,
            name: sanitizeText(msg?.location?.name || '', 200),
            address: sanitizeText(msg?.location?.address || '', 500)
          };
        } else {
          continue;
        }

        if (!text && messageType !== 'image' && messageType !== 'location') continue;

        messages.push({
          from,
          to,
          body: text,
          messageId: sanitizeText(msg?.id || '', 200),
          messageType,
          mediaId,
          location,
        });
      }
    }
  }

  return messages;
}

export async function sendMetaWhatsAppMessage({ to, text, interactive }) {
  if (!env.metaWhatsAppAccessToken || !env.metaWhatsAppPhoneNumberId) {
    throw new Error('Meta WhatsApp is not configured. Missing token or phone number ID.');
  }

  const phone = normalizeOutboundPhone(to);
  if (!phone) {
    throw new Error('Invalid WhatsApp recipient phone for Meta send');
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
  };

  if (interactive) {
    payload.type = 'interactive';
    payload.interactive = interactive;
  } else {
    payload.type = 'text';
    payload.text = {
      preview_url: false,
      body: sanitizeText(text, 3500),
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.metaWhatsAppApiVersion}/${env.metaWhatsAppPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.metaWhatsAppAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta WhatsApp send failed: ${response.status} ${errorBody}`);
  }

  return response.json();
}

/**
 * Sends a proactive dispatch notification to a volunteer.
 */
export async function sendMetaWhatsAppDispatch({ to, assignmentText }) {
  if (!env.metaWhatsAppAccessToken || !env.metaWhatsAppPhoneNumberId) {
    throw new Error('Meta WhatsApp is not configured. Missing token or phone number ID.');
  }

  const phone = normalizeOutboundPhone(to);
  if (!phone) {
    throw new Error('Invalid WhatsApp recipient phone for Meta send');
  }

  const baseUrl = `https://graph.facebook.com/${env.metaWhatsAppApiVersion}/${env.metaWhatsAppPhoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${env.metaWhatsAppAccessToken}`,
    'Content-Type': 'application/json',
  };

  // Step 1: TRY sending the direct text message first
  const textPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: {
      preview_url: false,
      body: sanitizeText(assignmentText, 3500),
    },
  };

  const firstTryRes = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(textPayload),
  });

  if (firstTryRes.ok) {
    const result = await firstTryRes.json();
    return { seamless: true, messages: result.messages };
  }

  // Step 2: Check for session window error
  const errorBody = await firstTryRes.text();
  let errorData;
  try {
    errorData = JSON.parse(errorBody);
  } catch (e) {
    throw new Error(`Meta WhatsApp send failed: ${firstTryRes.status} ${errorBody}`);
  }

  const errorCode = errorData?.error?.code;
  if (errorCode !== 131030 && errorCode !== 131047) {
    throw new Error(`Meta WhatsApp send failed: ${errorCode} ${errorData?.error?.message}`);
  }

  // Step 3: Send "Hello World" poke
  const templatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: {
      name: 'hello_world',
      language: { code: 'en_US' },
    },
  };

  const templateRes = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(templatePayload),
  });

  if (!templateRes.ok) {
    throw new Error(`Meta session opening failed: ${templateRes.status}`);
  }

  const templateResult = await templateRes.json();
  return {
    seamless: false,
    sessionOpened: true,
    templateMessage: templateResult,
    messages: templateResult.messages,
  };
}

/**
 * Sends a media message (image or document) via Meta WhatsApp API.
 */
async function uploadMetaWhatsAppMedia({ filePath, type }) {
  const buffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const contentType = MEDIA_MIME_TYPES[type] || 'application/octet-stream';
  const form = new FormData();

  form.append('messaging_product', 'whatsapp');
  form.append('type', contentType);
  form.append('file', new Blob([buffer], { type: contentType }), filename);

  const response = await fetch(
    `https://graph.facebook.com/${env.metaWhatsAppApiVersion}/${env.metaWhatsAppPhoneNumberId}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.metaWhatsAppAccessToken}`,
      },
      body: form,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta WhatsApp media upload failed: ${response.status} ${errorBody}`);
  }

  const result = await response.json();
  if (!result?.id) {
    throw new Error('Meta WhatsApp media upload did not return a media ID.');
  }

  return result.id;
}

function resolveUploadPublicPath(publicPath) {
  const cleanPath = String(publicPath || '').trim();
  if (!cleanPath.startsWith('/uploads/')) return '';

  const fileName = path.basename(cleanPath);
  const filePath = path.join(UPLOADS_DIR, fileName);
  return fs.existsSync(filePath) ? filePath : '';
}

export async function sendMetaWhatsAppMedia({ to, mediaUrl, mediaPath = '', type = 'image', caption = '' }) {
  if (!env.metaWhatsAppAccessToken || !env.metaWhatsAppPhoneNumberId) {
    throw new Error('Meta WhatsApp is not configured.');
  }

  const phone = normalizeOutboundPhone(to);
  if (!phone) throw new Error('Invalid phone');

  const localFilePath = resolveUploadPublicPath(mediaPath);
  const uploadedMediaId = localFilePath
    ? await uploadMetaWhatsAppMedia({ filePath: localFilePath, type })
    : '';

  if (!uploadedMediaId && !mediaUrl) {
    throw new Error('WhatsApp media requires either a local media path or a public media URL.');
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type,
    [type]: {
      ...(uploadedMediaId ? { id: uploadedMediaId } : { link: mediaUrl }),
    },
  };

  if (caption && type === 'image') {
    payload.image.caption = sanitizeText(caption, 1000);
  } else if (caption && type === 'document') {
    payload.document.caption = sanitizeText(caption, 1000);
    payload.document.filename = 'ServeX_Assignment.pdf';
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.metaWhatsAppApiVersion}/${env.metaWhatsAppPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.metaWhatsAppAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta WhatsApp media send failed: ${response.status} ${errorBody}`);
  }

  return response.json();
}

/**
 * Sends a native WhatsApp location message.
 */
export async function sendMetaWhatsAppLocation({ to, latitude, longitude, name, address }) {
  if (!env.metaWhatsAppAccessToken || !env.metaWhatsAppPhoneNumberId) {
    throw new Error('Meta WhatsApp is not configured.');
  }

  const phone = normalizeOutboundPhone(to);
  if (!phone) throw new Error('Invalid phone');

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Invalid location coordinates for WhatsApp location card: ${latitude}, ${longitude}`);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`Out-of-range location coordinates for WhatsApp location card: ${lat}, ${lng}`);
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'location',
    location: {
      latitude: lat,
      longitude: lng,
    },
  };

  const locationName = sanitizeText(name || '', 200);
  const locationAddress = sanitizeText(address || '', 500);
  if (locationName) payload.location.name = locationName;
  if (locationAddress) payload.location.address = locationAddress;

  const response = await fetch(
    `https://graph.facebook.com/${env.metaWhatsAppApiVersion}/${env.metaWhatsAppPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.metaWhatsAppAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Meta WhatsApp location send failed: ${response.status} ${errorBody}`);
  }

  return response.json();
}

/**
 * Downloads a media file from Meta using its media ID.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Downloads a media file from Meta using its media ID.
 */
export async function downloadMetaWhatsAppMedia(mediaId) {
  if (!mediaId) return '';

  try {
    console.log(`[Meta] Downloading media: ${mediaId}...`);
    const urlResponse = await fetchWithTimeout(
      `https://graph.facebook.com/${env.metaWhatsAppApiVersion}/${mediaId}`,
      { headers: { Authorization: `Bearer ${env.metaWhatsAppAccessToken}` } },
      10000
    );

    if (!urlResponse.ok) {
      console.warn(`[Meta] Media URL fetch failed: ${urlResponse.status}`);
      return '';
    }
    
    const { url, mime_type } = await urlResponse.json();
    if (!url) return '';

    const mediaResponse = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${env.metaWhatsAppAccessToken}` },
    }, 20000);

    if (!mediaResponse.ok) {
      console.warn(`[Meta] Media binary fetch failed: ${mediaResponse.status}`);
      return '';
    }
    const buffer = Buffer.from(await mediaResponse.arrayBuffer());

    const extension = mime_type?.split('/')?.[1] || 'jpg';
    const fileName = `wa_${mediaId}_${Date.now()}.${extension}`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    fs.writeFileSync(filePath, buffer);
    console.log(`[Meta] Media saved: ${fileName}`);
    return `/uploads/${fileName}`;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[Meta] Media download timed out for ID: ${mediaId}`);
    } else {
      console.error('[Meta] Media download error:', error.message);
    }
    return '';
  }
}
