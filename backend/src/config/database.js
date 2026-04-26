import dns from 'node:dns';
import mongoose from 'mongoose';

const DEFAULT_DNS_FALLBACK_SERVERS = ['8.8.8.8', '1.1.1.1'];

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSrvDnsLookupError(error, mongoUri) {
  if (!String(mongoUri || '').startsWith('mongodb+srv://')) {
    return false;
  }

  return error?.syscall === 'querySrv' && ['ECONNREFUSED', 'ETIMEOUT', 'EAI_AGAIN'].includes(error?.code);
}

function getDnsFallbackServers() {
  const raw = String(process.env.MONGO_DNS_FALLBACK_SERVERS || '').trim();
  if (!raw) return DEFAULT_DNS_FALLBACK_SERVERS;

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAtlasAccessConfigError(error) {
  const message = String(error?.message || '').toLowerCase();

  return (
    message.includes('ip that isn\'t whitelisted') ||
    message.includes('ip whitelist') ||
    message.includes('authentication failed') ||
    message.includes('bad auth')
  );
}

async function connectToInMemoryMongo() {
  console.warn('Falling back to local in-memory MongoDB for development...');

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  await mongoose.connect(uri, {
    autoIndex: true,
  });

  console.log('Connected to fallback in-memory MongoDB successfully. Starting fresh!');
}

export async function connectToDatabase(mongoUri) {
  mongoose.set('strictQuery', true);

  const maxRetries = toPositiveInt(process.env.MONGO_CONNECT_RETRIES, 3);
  const retryDelayMs = toPositiveInt(process.env.MONGO_CONNECT_RETRY_DELAY_MS, 1500);

  let dnsFallbackApplied = false;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(mongoUri, {
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
      });
      console.log('Connected to MongoDB successfully.');
      return;
    } catch (error) {
      const shouldFailFastToFallback = isAtlasAccessConfigError(error);

      if (!dnsFallbackApplied && isSrvDnsLookupError(error, mongoUri)) {
        const fallbackServers = getDnsFallbackServers();
        dns.setServers(fallbackServers);
        dnsFallbackApplied = true;
        console.warn(
          `MongoDB SRV lookup failed (${error.code}). Retrying with fallback DNS servers: ${fallbackServers.join(', ')}`
        );
      }

      if (shouldFailFastToFallback) {
        console.warn(
          `Detected MongoDB Atlas access configuration issue: ${error.message}`
        );
      }

      if (attempt >= maxRetries || shouldFailFastToFallback) {
        console.warn(`Failed to connect to primary MongoDB Atlas cluster: ${error.message}`);

        try {
          await connectToInMemoryMongo();
          return;
        } catch (memError) {
          console.error('Failed to start fallback in-memory MongoDB:', memError.message);
          throw error; // throw original Atlas error
        }
      }

      console.warn(
        `MongoDB connection attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${retryDelayMs}ms...`
      );
      await sleep(retryDelayMs);
    }
  }
}
