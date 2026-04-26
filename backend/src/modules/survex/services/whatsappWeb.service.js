import whatsappWeb from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { env } from '../../../config/env.js';
import { normalizeWhatsAppPhone, sanitizeText } from '../utils/sanitize.js';
import { processInboundSurveyMessage } from './inboundSurvey.service.js';

const { Client, LocalAuth } = whatsappWeb;

let clientInstance = null;
let started = false;

function normalizeChatToPhone(chatId) {
  const value = String(chatId || '');
  const base = value.split('@')[0] || '';
  return normalizeWhatsAppPhone(base);
}

export async function initializeWhatsAppWebBot() {
  if (started) return clientInstance;

  if (env.survexWhatsAppProvider !== 'whatsapp_web') {
    return null;
  }

  started = true;

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'servex-bot' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('Scan this QR in WhatsApp to connect ServeX bot:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('ServeX WhatsApp Web bot is ready.');
  });

  client.on('auth_failure', (message) => {
    console.error('WhatsApp Web auth failure:', message);
  });

  client.on('disconnected', (reason) => {
    console.warn('WhatsApp Web disconnected:', reason);
    started = false;
    clientInstance = null;
  });

  client.on('message', async (message) => {
    try {
      if (message.fromMe) return;
      if (!String(message.from || '').includes('@c.us')) return;

      const from = normalizeChatToPhone(message.from);
      const to = normalizeWhatsAppPhone(env.servexWhatsAppPublicNumber || '');
      const body = sanitizeText(message.body || '', 3000);
      const messageSid = sanitizeText(message.id?._serialized || '', 200);

      if (!from) return;

      // Determine message type and extract media/location
      let messageType = 'text';
      let mediaId = '';
      let location = null;

      if (message.hasMedia) {
        messageType = 'image';
        // WhatsApp Web.js media is handled via message.downloadMedia()
        // We pass a flag and handle download differently
      }

      if (message.location) {
        messageType = 'location';
        location = {
          latitude: message.location.latitude,
          longitude: message.location.longitude,
          name: sanitizeText(message.location.description || '', 200),
          address: sanitizeText(message.location.address || '', 500),
        };
      }

      if (!body && messageType === 'text') return;

      const reply = await processInboundSurveyMessage({
        from,
        to,
        body: body || (messageType === 'location' ? '[location]' : '[photo]'),
        messageSid,
        messageType,
        mediaId,
        location,
      });

      if (reply?.skipReply) {
        return;
      }

      await client.sendMessage(message.from, reply?.message || 'Unable to process message. Please retry.');
    } catch (error) {
      console.error('WhatsApp Web inbound handling failed:', error.message);
      try {
        if (message?.from && String(message.from).includes('@c.us')) {
          await client.sendMessage(
            message.from,
            'Sorry, I hit an internal error while processing that message. Please try again.'
          );
        }
      } catch (sendError) {
        console.error('WhatsApp Web error reply failed:', sendError.message);
      }
    }
  });

  await client.initialize();
  clientInstance = client;
  return clientInstance;
}
