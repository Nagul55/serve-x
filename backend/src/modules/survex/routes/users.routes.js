import { Router } from 'express';
import { SurvexUser, hashSurvexPassword } from '../models/survexUser.model.js';
import { requireCoordinator, requireSurvexAuth } from '../middleware/survexAuth.js';
import { normalizeWhatsAppPhone, sanitizeText } from '../utils/sanitize.js';

const router = Router();

router.use(requireSurvexAuth, requireCoordinator);

router.get('/field-officers', async (req, res, next) => {
  try {
    const officers = await SurvexUser.find({
      role: 'field_officer',
      assignedCoordinatorId: req.survexAuth.userId,
    }).sort({ name: 1 });

    return res.json(officers.map((user) => ({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      assignedCoordinatorId: user.assignedCoordinatorId?.toString() || null,
      is_active: user.is_active,
      created_date: user.created_date,
    })));
  } catch (error) {
    return next(error);
  }
});

router.post('/field-officers', async (req, res, next) => {
  try {
    const name = sanitizeText(req.body?.name, 100);
    const phone = normalizeWhatsAppPhone(req.body?.phone);
    const password = String(req.body?.password || '');

    if (!name || !phone || password.length < 8) {
      return res.status(400).json({ error: 'name, phone and password (>=8 chars) are required' });
    }

    const existing = await SurvexUser.findOne({ phone });
    if (existing) {
      return res.status(409).json({ error: 'A user with this phone already exists' });
    }

    const password_hash = await hashSurvexPassword(password);
    const user = await SurvexUser.create({
      name,
      phone,
      role: 'field_officer',
      assignedCoordinatorId: req.survexAuth.userId,
      password_hash,
      is_active: true,
    });

    return res.status(201).json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      assignedCoordinatorId: user.assignedCoordinatorId?.toString() || null,
      is_active: user.is_active,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/field-officers/:id/status', async (req, res, next) => {
  try {
    const isActive = Boolean(req.body?.is_active);

    const user = await SurvexUser.findOne({
      _id: req.params.id,
      role: 'field_officer',
      assignedCoordinatorId: req.survexAuth.userId,
    });

    if (!user) {
      return res.status(404).json({ error: 'Field officer not found' });
    }

    user.is_active = isActive;
    await user.save();

    return res.json({
      id: user.id,
      is_active: user.is_active,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
