import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Session } from '../models/session.model.js';
import { User, hashUserPassword } from '../models/user.model.js';
import {
  buildAccessJwt,
  buildRefreshJwt,
  hashToken,
  isValidEmail,
  normalizeEmail,
  resolveClientIp,
  verifyRefreshJwt,
} from '../utils/auth.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();
const VALID_ROLES = new Set(['coordinator', 'field_officer']);
const DEMO_LOGIN_CREDENTIALS = {
  coordinator: {
    email: 'coordinator@gmail.com',
    password: 'coordinator@123',
    name: 'ServeX Coordinator',
  },
  field_officer: {
    email: 'fieldofficer@gmail.com',
    password: 'fieldofficer@gmail.com',
    name: 'ServeX Field Officer',
  },
};

function decodeExp(token) {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) return new Date(Date.now() + 15 * 60 * 1000);
  return new Date(decoded.exp * 1000);
}

function sanitizeSession(session, currentSessionId) {
  return {
    id: session.id,
    email: session.email,
    role: session.role,
    ip: session.ip,
    user_agent: session.user_agent,
    created_date: session.created_date,
    updated_date: session.updated_date,
    last_rotated_at: session.last_rotated_at,
    refresh_expires_at: session.refresh_expires_at,
    field_officer_verified: Boolean(session.field_officer_verified),
    field_officer_verified_at: session.field_officer_verified_at,
    revoked_at: session.revoked_at,
    is_current: session.id === currentSessionId,
  };
}

async function issueSessionTokens({ user, session, ip, userAgent }) {
  const accessJti = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();

  const accessToken = buildAccessJwt({
    userId: user.id,
    email: user.email,
    role: user.role,
    jti: accessJti,
    sessionId: session.id,
    claims: {
      assignedCoordinatorId: user.assigned_coordinator_id?.toString() || null,
      fieldOfficerVerified: Boolean(session.field_officer_verified),
    },
  });

  const refreshToken = buildRefreshJwt({
    userId: user.id,
    email: user.email,
    role: user.role,
    refreshJti,
    sessionId: session.id,
    claims: {
      assignedCoordinatorId: user.assigned_coordinator_id?.toString() || null,
    },
  });

  session.jti = accessJti;
  session.access_jti = accessJti;
  session.refresh_jti = refreshJti;
  session.access_expires_at = decodeExp(accessToken);
  session.refresh_expires_at = decodeExp(refreshToken);
  session.refresh_token_hash = hashToken(refreshToken);
  session.last_rotated_at = new Date();
  session.ip = ip || session.ip;
  session.user_agent = userAgent || session.user_agent;
  session.role = user.role;

  await session.save();

  return {
    accessToken,
    refreshToken,
  };
}

function sanitizeUser(user, session) {
  return {
    id: user.id,
    name: user.name || '',
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    assignedCoordinatorId: user.assigned_coordinator_id?.toString() || null,
    field_officer_verified: Boolean(session?.field_officer_verified),
  };
}

async function resolveLoginUser(email, role) {
  const user = await User.findOne({
    email,
    role,
    is_active: true,
  });

  if (!user) {
    return { error: { status: 401, message: 'User not found for this role' } };
  }

  if (role === 'field_officer' && !user.assigned_coordinator_id) {
    return { error: { status: 403, message: 'Field officer is not assigned to a coordinator' } };
  }

  return { user };
}

async function ensureDemoLoginUsers() {
  const coordinatorCredential = DEMO_LOGIN_CREDENTIALS.coordinator;
  const fieldOfficerCredential = DEMO_LOGIN_CREDENTIALS.field_officer;

  let coordinator = await User.findOne({ email: coordinatorCredential.email });
  if (!coordinator) {
    coordinator = await User.create({
      name: coordinatorCredential.name,
      email: coordinatorCredential.email,
      role: 'coordinator',
      password_hash: await hashUserPassword(coordinatorCredential.password),
      is_active: true,
    });
  } else {
    coordinator.name = coordinatorCredential.name;
    coordinator.role = 'coordinator';
    coordinator.assigned_coordinator_id = null;
    coordinator.is_active = true;
    const coordinatorPasswordValid = await coordinator.verifyPassword(coordinatorCredential.password);
    if (!coordinatorPasswordValid) {
      coordinator.password_hash = await hashUserPassword(coordinatorCredential.password);
    }
    await coordinator.save();
  }

  let fieldOfficer = await User.findOne({ email: fieldOfficerCredential.email });
  if (!fieldOfficer) {
    fieldOfficer = await User.create({
      name: fieldOfficerCredential.name,
      email: fieldOfficerCredential.email,
      role: 'field_officer',
      assigned_coordinator_id: coordinator._id,
      password_hash: await hashUserPassword(fieldOfficerCredential.password),
      is_active: true,
    });
  } else {
    fieldOfficer.name = fieldOfficerCredential.name;
    fieldOfficer.role = 'field_officer';
    fieldOfficer.assigned_coordinator_id = coordinator._id;
    fieldOfficer.is_active = true;
    const fieldOfficerPasswordValid = await fieldOfficer.verifyPassword(fieldOfficerCredential.password);
    if (!fieldOfficerPasswordValid) {
      fieldOfficer.password_hash = await hashUserPassword(fieldOfficerCredential.password);
    }
    await fieldOfficer.save();
  }
}

router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const role = String(req.body?.role || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!isValidEmail(email) || !VALID_ROLES.has(role) || !password.trim()) {
      return res.status(400).json({ error: 'email, role, and password are required' });
    }

    const expected = DEMO_LOGIN_CREDENTIALS[role];
    if (!expected || email !== expected.email) {
      return res.status(401).json({ error: 'Use the provided demo email for the selected role' });
    }

    await ensureDemoLoginUsers();

    const { user, error } = await resolveLoginUser(email, role);
    if (error) {
      return res.status(error.status).json({ error: error.message });
    }

    const passwordMatches = await user.verifyPassword(password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const session = new Session({
      user_id: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
      access_jti: crypto.randomUUID(),
      access_expires_at: new Date(),
      refresh_jti: crypto.randomUUID(),
      refresh_token_hash: crypto.randomUUID(),
      refresh_expires_at: new Date(),
      field_officer_verified: true,
      field_officer_verified_at: new Date(),
      ip: resolveClientIp(req),
      user_agent: String(req.headers['user-agent'] || ''),
    });

    const { accessToken, refreshToken } = await issueSessionTokens({
      user,
      session,
      ip: resolveClientIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
    });

    user.last_login_at = new Date();
    await user.save();

    return res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: sanitizeUser(user, session),
      session: sanitizeSession(session, session.id),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refresh_token || '').trim();
    if (!refreshToken) {
      return res.status(400).json({ error: 'refresh_token is required' });
    }

    let payload;
    try {
      payload = verifyRefreshJwt(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    if (payload?.typ !== 'refresh' || !payload?.sid || !payload?.rjti) {
      return res.status(401).json({ error: 'Invalid refresh token payload' });
    }

    const session = await Session.findOne({
      _id: payload.sid,
      user_id: payload.sub,
      refresh_jti: payload.rjti,
      revoked_at: null,
      refresh_expires_at: { $gt: new Date() },
    });

    if (!session) {
      return res.status(401).json({ error: 'Refresh session is not active' });
    }

    const incomingHash = hashToken(refreshToken);
    if (incomingHash !== session.refresh_token_hash) {
      session.revoked_at = new Date();
      await session.save();
      return res.status(401).json({ error: 'Refresh token reuse detected. Session revoked.' });
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.is_active) {
      session.revoked_at = new Date();
      await session.save();
      return res.status(401).json({ error: 'User not found for session' });
    }

    if (user.role === 'field_officer' && !user.assigned_coordinator_id) {
      session.revoked_at = new Date();
      await session.save();
      return res.status(403).json({ error: 'Field officer is not assigned to a coordinator' });
    }

    session.rotation_counter += 1;

    const { accessToken, refreshToken: rotatedRefreshToken } = await issueSessionTokens({
      user,
      session,
      ip: resolveClientIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
    });

    res.json({
      access_token: accessToken,
      refresh_token: rotatedRefreshToken,
      user: sanitizeUser(user, session),
      session: sanitizeSession(session, session.id),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({
    id: req.currentUser.id,
    name: req.currentUser.name || '',
    email: req.currentUser.email,
    phone: req.currentUser.phone || '',
    role: req.currentUser.role,
    assignedCoordinatorId: req.currentUser.assigned_coordinator_id?.toString() || null,
    field_officer_verified: req.currentUser.role === 'field_officer'
      ? Boolean(req.authSession?.field_officer_verified)
      : true,
    last_login_at: req.currentUser.last_login_at,
  });
});

router.get('/field-officer-access', requireAuth, (req, res) => {
  if (req.auth.role !== 'field_officer') {
    return res.status(400).json({ error: 'Only field officers can access this route' });
  }

  if (!req.auth.assignedCoordinatorId) {
    return res.status(403).json({ error: 'Field officer is not assigned to a coordinator' });
  }

  return res.json({
    allowed: true,
    whatsappNumber: env.servexWhatsAppPublicNumber,
    whatsappProvider: env.survexWhatsAppProvider,
    launcherMessage: 'Hey servex',
  });
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await Session.findOneAndUpdate({ _id: req.auth.sessionId }, { revoked_at: new Date() });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await Session.updateMany(
      { user_id: req.auth.userId, revoked_at: null },
      { revoked_at: new Date() }
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const sessions = await Session.find({ user_id: req.auth.userId })
      .sort({ created_date: -1 })
      .limit(30);

    res.json(sessions.map((session) => sanitizeSession(session, req.auth.sessionId)));
  } catch (error) {
    next(error);
  }
});

router.delete('/sessions/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ _id: sessionId, user_id: req.auth.userId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.revoked_at = new Date();
    await session.save();

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
