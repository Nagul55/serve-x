import { Router } from 'express';
import { env } from '../config/env.js';
import { resetAndSeedServeXFreshStart } from '../services/freshStart.service.js';
import { normalizeWhatsAppPhone, sanitizeText } from '../modules/survex/utils/sanitize.js';
import { SurvexUser, hashSurvexPassword } from '../modules/survex/models/survexUser.model.js';
import { normalizeEmail } from '../utils/auth.js';

const router = Router();

function isLoopbackIp(ip) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(ip || '').trim());
}

function canAccessSetupRoute(req) {
  const providedToken = String(req.headers['x-servex-setup-token'] || '').trim();
  if (env.servexSetupToken) {
    return providedToken === env.servexSetupToken;
  }

  // In development, allow local-machine only when no token is configured.
  return env.nodeEnv !== 'production' && isLoopbackIp(req.socket?.remoteAddress || '');
}

function readOverrides(body = {}) {
  return {
    coordinatorName: sanitizeText(body.coordinator_name, 80),
    coordinatorEmail: normalizeEmail(body.coordinator_email || ''),
    coordinatorPhone: normalizeWhatsAppPhone(body.coordinator_phone || ''),
    fieldOfficerName: sanitizeText(body.field_officer_name, 80),
    fieldOfficerEmail: normalizeEmail(body.field_officer_email || ''),
    fieldOfficerPhone: normalizeWhatsAppPhone(body.field_officer_phone || ''),
    volunteerName: sanitizeText(body.volunteer_name, 80),
    volunteerEmail: normalizeEmail(body.volunteer_email || ''),
    volunteerPhone: normalizeWhatsAppPhone(body.volunteer_phone || ''),
    survexPassword: String(body.survex_password || '').trim(),
  };
}

async function pickFallbackCoordinatorPhone() {
  for (let index = 1; index <= 99; index += 1) {
    const candidate = `+100000000${String(index).padStart(2, '0')}`;
    const exists = await SurvexUser.exists({ phone: candidate });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate a fallback coordinator phone for Survex setup');
}

async function resolveOrCreateCoordinator({ coordinatorPhone, coordinatorName, passwordHash }) {
  const normalizedCoordinatorPhone = normalizeWhatsAppPhone(coordinatorPhone || '');

  let coordinator = null;

  if (normalizedCoordinatorPhone) {
    coordinator = await SurvexUser.findOne({
      role: 'coordinator',
      phone: normalizedCoordinatorPhone,
    });
  }

  if (!coordinator) {
    coordinator = await SurvexUser.findOne({ role: 'coordinator' }).sort({ created_date: 1 });
  }

  if (coordinator) {
    coordinator.name = coordinatorName || coordinator.name;
    coordinator.is_active = true;
    if (!coordinator.password_hash) {
      coordinator.password_hash = passwordHash;
    }
    await coordinator.save();
    return coordinator;
  }

  const phoneToUse = normalizedCoordinatorPhone || await pickFallbackCoordinatorPhone();

  return SurvexUser.create({
    name: coordinatorName || 'ServeX Coordinator',
    phone: phoneToUse,
    role: 'coordinator',
    password_hash: passwordHash,
    is_active: true,
  });
}

router.post('/reset-fresh-start', async (req, res, next) => {
  try {
    if (!canAccessSetupRoute(req)) {
      return res.status(401).json({
        error: env.servexSetupToken
          ? 'Invalid setup token'
          : 'Setup route is restricted to local development only unless SERVEX_SETUP_TOKEN is configured',
      });
    }

    const confirmation = String(req.headers['x-servex-confirm-reset'] || '').trim().toLowerCase();
    if (confirmation !== 'yes') {
      return res.status(400).json({
        error: 'Missing reset confirmation header. Set x-servex-confirm-reset: yes',
      });
    }

    const seedResult = await resetAndSeedServeXFreshStart(readOverrides(req.body || {}));

    return res.json({
      ok: true,
      message: 'ServeX has been reset and seeded with fresh identities.',
      ...seedResult,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/register-survex-field-officer', async (req, res, next) => {
  try {
    if (!canAccessSetupRoute(req)) {
      return res.status(401).json({
        error: env.servexSetupToken
          ? 'Invalid setup token'
          : 'Setup route is restricted to local development only unless SERVEX_SETUP_TOKEN is configured',
      });
    }

    const fieldOfficerPhone = normalizeWhatsAppPhone(
      req.body?.field_officer_phone || req.body?.phone || ''
    );
    const fieldOfficerName = sanitizeText(
      req.body?.field_officer_name || req.body?.name,
      80
    ) || 'ServeX Field Officer';
    const coordinatorPhone = normalizeWhatsAppPhone(req.body?.coordinator_phone || '');
    const coordinatorName = sanitizeText(req.body?.coordinator_name, 80) || 'ServeX Coordinator';
    const survexPassword = String(
      req.body?.survex_password
      || process.env.SERVEX_RESET_SURVEX_PASSWORD
      || 'ServeX@12345'
    ).trim();

    if (!fieldOfficerPhone) {
      return res.status(400).json({ error: 'field_officer_phone is required' });
    }

    if (survexPassword.length < 8) {
      return res.status(400).json({ error: 'survex_password must be at least 8 characters' });
    }

    const existingByPhone = await SurvexUser.findOne({ phone: fieldOfficerPhone });
    if (existingByPhone && existingByPhone.role !== 'field_officer') {
      return res.status(409).json({
        error: 'The provided phone already belongs to a coordinator. Use a different field officer phone.',
      });
    }

    const passwordHash = await hashSurvexPassword(survexPassword);
    const coordinator = await resolveOrCreateCoordinator({
      coordinatorPhone,
      coordinatorName,
      passwordHash,
    });

    let fieldOfficer = existingByPhone && existingByPhone.role === 'field_officer'
      ? existingByPhone
      : null;

    if (!fieldOfficer) {
      fieldOfficer = await SurvexUser.findOne({
        role: 'field_officer',
        assignedCoordinatorId: coordinator._id,
      }).sort({ created_date: 1 });
    }

    if (!fieldOfficer) {
      fieldOfficer = await SurvexUser.findOne({ role: 'field_officer' }).sort({ created_date: 1 });
    }

    if (!fieldOfficer) {
      fieldOfficer = await SurvexUser.create({
        name: fieldOfficerName,
        phone: fieldOfficerPhone,
        role: 'field_officer',
        assignedCoordinatorId: coordinator._id,
        password_hash: passwordHash,
        is_active: true,
      });
    } else {
      fieldOfficer.name = fieldOfficerName || fieldOfficer.name;
      fieldOfficer.phone = fieldOfficerPhone;
      fieldOfficer.assignedCoordinatorId = coordinator._id;
      fieldOfficer.is_active = true;
      if (!fieldOfficer.password_hash) {
        fieldOfficer.password_hash = passwordHash;
      }
      await fieldOfficer.save();
    }

    return res.json({
      ok: true,
      message: 'Survex field officer phone registered successfully.',
      fieldOfficer: {
        id: fieldOfficer.id,
        name: fieldOfficer.name,
        phone: fieldOfficer.phone,
        role: fieldOfficer.role,
        assignedCoordinatorId: fieldOfficer.assignedCoordinatorId?.toString() || null,
        is_active: fieldOfficer.is_active,
      },
      coordinator: {
        id: coordinator.id,
        name: coordinator.name,
        phone: coordinator.phone,
        role: coordinator.role,
        is_active: coordinator.is_active,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
