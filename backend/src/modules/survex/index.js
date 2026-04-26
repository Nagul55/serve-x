import { Router } from 'express';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import surveysRoutes from './routes/surveys.routes.js';
import webhookRoutes from './routes/webhook.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/surveys', surveysRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
