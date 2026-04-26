import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from './config/env.js';
import { connectToDatabase } from './config/database.js';
import { createCrudRouter } from './routes/crudRouter.js';
import integrationsRouter from './routes/integrations.routes.js';
import authRouter from './routes/auth.routes.js';
import setupRouter from './routes/setup.routes.js';
import notificationsRouter from './routes/notifications.routes.js';
import { ensureServeXSeedOnEmptyDb } from './services/freshStart.service.js';
import survexRouter from './modules/survex/index.js';
import { initializeWhatsAppWebBot } from './modules/survex/services/whatsappWeb.service.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { CommunityNeed } from './models/communityNeed.model.js';
import { Volunteer } from './models/volunteer.model.js';
import { Dispatch } from './models/dispatch.model.js';
import { FieldReport } from './models/fieldReport.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const survexDashboardPath = path.resolve(__dirname, '../public/survex');
const uploadsDir = path.resolve(__dirname, '../../public/uploads');
const legacyUploadsDir = path.resolve(__dirname, '../public/uploads');

function parseCorsOrigins(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const configuredCorsOrigins = parseCorsOrigins(env.corsOrigin);
const devCorsOrigins = ['http://127.0.0.1:5173'];
const allowedCorsOrigins = env.nodeEnv === 'production'
  ? configuredCorsOrigins
  : Array.from(new Set([...configuredCorsOrigins, ...devCorsOrigins]));

function isCorsOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedCorsOrigins.includes('*')) return true;
  return allowedCorsOrigins.includes(origin);
}

const app = express();

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isCorsOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin denied: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'serve-x-backend',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use('/survex', express.static(survexDashboardPath));
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', express.static(legacyUploadsDir));
app.use('/api/survex', survexRouter);

app.use('/api/setup', setupRouter);
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

app.use('/api/community-needs', createCrudRouter(CommunityNeed));
app.use('/api/volunteers', createCrudRouter(Volunteer));
app.use('/api/dispatches', createCrudRouter(Dispatch));
app.use('/api/field-reports', createCrudRouter(FieldReport));
app.use('/api/integrations', integrationsRouter);
app.use('/api/notifications', notificationsRouter);

app.use((error, _req, res, _next) => {
  const status = error?.name === 'ValidationError' ? 400 : 500;
  res.status(status).json({
    error: error.message || 'Internal server error',
  });
});

async function start() {
  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory: ${uploadsDir}`);
  }

  await connectToDatabase(env.mongoUri);

  if (env.servexAutoSeedOnEmptyDb) {
    try {
      const result = await ensureServeXSeedOnEmptyDb();
      if (result.seeded) {
        console.log('Auto-seeded baseline ServeX users on empty database.');
      }
    } catch (error) {
      console.warn(`Failed to auto-seed baseline users: ${error.message}`);
    }
  }

  app.listen(env.port, () => {
    console.log(`ServeX backend running on http://127.0.0.1:${env.port}`);
  });

  // Only initialize WhatsApp Web bot if provider is whatsapp_web
  if (env.survexWhatsAppProvider === 'whatsapp_web') {
    initializeWhatsAppWebBot().catch((error) => {
      console.error('Failed to initialize WhatsApp Web bot:', error.message);
    });
  } else {
    console.log(`WhatsApp provider: ${env.survexWhatsAppProvider} (WhatsApp Web bot disabled)`);
  }
}

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});


