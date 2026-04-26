import ngrok from 'ngrok';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../../.env');

const DEFAULT_PORT = Number(process.env.PORT || 4000);
const DEFAULT_NGROK_TOKEN = process.env.NGROK_AUTHTOKEN || process.env.NGROK_TOKEN || '';

function upsertEnvLine(content, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = `${key}=${value}`;

  if (new RegExp(`^${escapedKey}=`, 'm').test(content)) {
    return content.replace(new RegExp(`^${escapedKey}=.*$`, 'm'), line);
  }

  return content.endsWith('\n') ? `${content}${line}\n` : `${content}\n${line}\n`;
}

function updateWebhookEnv(url) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = upsertEnvLine(envContent, 'SERVEX_WHATSAPP_PUBLIC_URL', url);
  envContent = upsertEnvLine(envContent, 'SURVEX_META_WEBHOOK_URL', `${url}/api/survex/webhooks/whatsapp/meta`);

  fs.writeFileSync(envPath, envContent);
  console.log('📝 Updated .env file with ngrok public + webhook URLs.');
}

async function resolveExistingTunnelUrl() {
  const api = ngrok.getApi();
  if (!api) return '';

  try {
    const result = await api.listTunnels();
    const existingHttpTunnel = result?.tunnels?.find((tunnel) =>
      typeof tunnel?.public_url === 'string' &&
      tunnel.public_url.startsWith('https://')
    );
    return existingHttpTunnel?.public_url || '';
  } catch {
    return '';
  }
}

async function start() {
  console.log("🚀 Starting ServeX Professional Tunnel...");
  
  try {
    if (DEFAULT_NGROK_TOKEN) {
      try {
        await ngrok.authtoken(DEFAULT_NGROK_TOKEN);
      } catch (tokenError) {
        console.warn(`⚠️ Could not apply NGROK authtoken (${tokenError.message}). Continuing with existing ngrok config.`);
      }
    }

    // Clean previous node-managed tunnel sessions to avoid "tunnel already exists" races.
    try {
      await ngrok.disconnect();
    } catch {}

    let url = '';

    try {
      url = await ngrok.connect({
        addr: DEFAULT_PORT,
        proto: 'http',
      });
    } catch (error) {
      const details = String(error?.body?.details?.err || '');
      if (details.includes('already exists')) {
        const existingUrl = await resolveExistingTunnelUrl();
        if (existingUrl) {
          url = existingUrl;
          console.log(`ℹ️ Reusing existing tunnel: ${url}`);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    if (!url) {
      throw new Error('Failed to resolve an ngrok URL');
    }

    console.log(`✅ Tunnel Open: ${url}`);
    console.log(`🔗 Webhook URL: ${url}/api/survex/webhooks/whatsapp/meta`);

    updateWebhookEnv(url);

    console.log('\n⚠️  Keep this terminal open! If you close it, the tunnel will stop.');
    console.log('👉 Copy the Webhook URL above into your Meta Dashboard callback URL.');

    const shutdown = async () => {
      try {
        await ngrok.disconnect();
        await ngrok.kill();
      } catch {}
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep script alive so the user can run this as a long-lived tunnel process.
    await new Promise(() => {});

  } catch (error) {
    const details = error?.body?.details ? ` | details: ${JSON.stringify(error.body.details)}` : '';
    console.error("❌ Failed to start tunnel:", `${error.message}${details}`);
    process.exit(1);
  }
}

start();
