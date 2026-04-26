import { Router } from 'express';
import { SurvexUser, hashSurvexPassword } from '../models/survexUser.model.js';
import { normalizeWhatsAppPhone, sanitizeText } from '../utils/sanitize.js';
import { signSurvexJwt, survexAuthRateLimiter } from '../utils/security.js';
import { requireSurvexAuth } from '../middleware/survexAuth.js';

const router = Router();

router.post('/login', survexAuthRateLimiter, async (req, res, next) => {
  try {
    const phone = normalizeWhatsAppPhone(req.body?.phone);
    const password = String(req.body?.password || '');

    if (!phone || !password) {
      return res.status(400).json({ error: 'phone and password are required' });
    }

    const user = await SurvexUser.findOne({ phone, is_active: true });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordOk = await user.verifyPassword(password);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const coordinatorId = user.role === 'coordinator'
      ? user.id
      : user.assignedCoordinatorId?.toString() || null;

    if (user.role === 'field_officer' && !coordinatorId) {
      return res.status(403).json({ error: 'Field officer is not assigned to a coordinator' });
    }

    const token = signSurvexJwt({
      sub: user.id,
      role: user.role,
      coordinatorId,
      assignedCoordinatorId: user.assignedCoordinatorId?.toString() || null,
      phone: user.phone,
    });

    user.last_login_at = new Date();
    await user.save();

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        assignedCoordinatorId: user.assignedCoordinatorId?.toString() || null,
        coordinatorId,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireSurvexAuth, async (req, res) => {
  const user = req.survexUser;
  return res.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    assignedCoordinatorId: user.assignedCoordinatorId?.toString() || null,
    coordinatorId: user.role === 'coordinator'
      ? user.id
      : user.assignedCoordinatorId?.toString() || null,
    last_login_at: user.last_login_at,
  });
});

router.post('/logout', requireSurvexAuth, (_req, res) => {
  return res.status(204).send();
});

router.post('/bootstrap-coordinator', async (req, res, next) => {
  try {
    const enabled = process.env.SURVEX_ALLOW_BOOTSTRAP_COORDINATOR === 'true';
    if (!enabled) {
      return res.status(403).json({ error: 'Bootstrap endpoint is disabled' });
    }

    const existingCoordinator = await SurvexUser.findOne({ role: 'coordinator' });
    if (existingCoordinator) {
      return res.status(409).json({ error: 'Coordinator already exists. Use authenticated user management APIs.' });
    }

    const name = sanitizeText(req.body?.name, 100);
    const phone = normalizeWhatsAppPhone(req.body?.phone);
    const password = String(req.body?.password || '');

    if (!name || !phone || password.length < 8) {
      return res.status(400).json({ error: 'name, phone and password (>=8 chars) are required' });
    }

    const password_hash = await hashSurvexPassword(password);

    const coordinator = await SurvexUser.create({
      name,
      phone,
      role: 'coordinator',
      password_hash,
    });

    return res.status(201).json({
      id: coordinator.id,
      name: coordinator.name,
      phone: coordinator.phone,
      role: coordinator.role,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
