import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { OtpCode } from '../models/otpCode.model.js';
import { Session } from '../models/session.model.js';
import { User } from '../models/user.model.js';
import {
  buildAccessJwt,
  buildRefreshJwt,
  generateOtp,
  hashToken,
  hashOtp,
  isValidEmail,
  normalizeEmail,
  resolveClientIp,
  verifyRefreshJwt,
} from '../utils/auth.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { sendOtpEmail, smtpConfigured } from '../services/email.service.js';

const router = Router();
const VALID_ROLES = new Set(['coordinator', 'field_officer']);

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
    otp_verified: Boolean(session?.field_officer_verified),
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

async function sendLoginOtp(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const role = String(req.body?.role || '').trim().toLowerCase();

    if (!isValidEmail(email) || !VALID_ROLES.has(role)) {
      return res.status(400).json({ error: 'email and valid role are required' });
    }

    const { user, error } = await resolveLoginUser(email, role);
    if (error) {
      return res.status(error.status).json({ error: error.message });
    }

    const ip = resolveClientIp(req);
    const userAgent = String(req.headers['user-agent'] || '');
    const windowStart = new Date(Date.now() - env.otpRateLimitWindowMinutes * 60 * 1000);

    const [emailCount, ipCount] = await Promise.all([
      OtpCode.countDocuments({ email, role, created_date: { $gte: windowStart } }),
      OtpCode.countDocuments({ ip, created_date: { $gte: windowStart } }),
    ]);

    if (emailCount >= env.otpMaxPerEmailWindow) {
      return res.status(429).json({
        error: `Too many OTP requests for this email. Try again in ${env.otpRateLimitWindowMinutes} minutes.`,
      });
    }

    if (ipCount >= env.otpMaxPerIpWindow) {
      return res.status(429).json({
        error: `Too many OTP requests from this IP. Try again in ${env.otpRateLimitWindowMinutes} minutes.`,
      });
    }

    await OtpCode.updateMany(
      { email, role, user_id: user.id, used_at: null },
      { used_at: new Date() }
    );

    const otp = generateOtp();
    const otpHash = hashOtp(email, otp);
    const expiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000);

    await OtpCode.create({
      email,
      user_id: user.id,
      role,
      otp_hash: otpHash,
      expires_at: expiresAt,
      ip,
      user_agent: userAgent,
    });

    let deliveryMethod = 'smtp';
    try {
      await sendOtpEmail({
        toEmail: email,
        otp,
        expiresInMinutes: env.otpExpiresMinutes,
      });
    } catch (error2) {
      deliveryMethod = 'development-fallback';
      console.warn('Failed to send OTP via SMTP:', error2.message);

      if (env.nodeEnv === 'production') {
        return res.status(503).json({ error: 'OTP delivery service unavailable' });
      }

      if (!env.exposeDevOtp) {
        return res.status(503).json({
          error: 'OTP delivery failed. Configure SMTP or enable EXPOSE_DEV_OTP in development.',
        });
      }
    }

    if (deliveryMethod !== 'smtp') {
      console.log(`[ServeX OTP] ${email}: ${otp}`);
    }

    const payload = {
      success: true,
      message: 'OTP issued successfully',
      expires_in_minutes: env.otpExpiresMinutes,
      delivery_method: deliveryMethod,
      requires_otp: true,
      role,
    };

    if (env.nodeEnv !== 'production' && env.exposeDevOtp) {
      payload.dev_otp = otp;
    }

    if (!smtpConfigured()) {
      payload.smtp_configured = false;
    }

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

router.post('/login', sendLoginOtp);

router.post('/send-otp', sendLoginOtp);

router.post('/verify-otp', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const role = String(req.body?.role || '').trim().toLowerCase();
    const otp = String(req.body?.otp || '').trim();

    if (!isValidEmail(email) || !VALID_ROLES.has(role) || !/^\d{4,8}$/.test(otp)) {
      return res.status(400).json({ error: 'email, role, and valid OTP are required' });
    }

    const { user, error } = await resolveLoginUser(email, role);
    if (error) {
      return res.status(error.status).json({ error: error.message });
    }

    const otpRecord = await OtpCode.findOne({
      email,
      role,
      user_id: user.id,
      used_at: null,
    }).sort({ created_date: -1 });

    if (!otpRecord) {
      return res.status(400).json({ error: 'No OTP request found for this user' });
    }

    if (otpRecord.expires_at <= new Date()) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    if (otpRecord.attempts >= env.otpMaxAttempts) {
      return res.status(429).json({ error: 'Too many invalid attempts. Request a new OTP.' });
    }

    const incomingHash = hashOtp(email, otp);
    if (incomingHash !== otpRecord.otp_hash) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    otpRecord.used_at = new Date();
    await otpRecord.save();

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
      requires_otp: false,
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
    otp_verified: req.currentUser.role === 'field_officer'
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
