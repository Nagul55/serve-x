import { SurvexUser } from '../models/survexUser.model.js';
import { verifySurvexJwt, isMetaRequestValid } from '../utils/security.js';

export async function requireSurvexAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    let payload;
    try {
      payload = verifySurvexJwt(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await SurvexUser.findById(payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not active' });
    }

    req.survexAuth = {
      userId: user.id,
      role: user.role,
      assignedCoordinatorId: user.assignedCoordinatorId?.toString() || null,
      coordinatorId: payload.coordinatorId || null,
      phone: user.phone,
    };
    req.survexUser = user;

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireCoordinator(req, res, next) {
  if (req.survexAuth?.role !== 'coordinator') {
    return res.status(403).json({ error: 'Coordinator role required' });
  }
  return next();
}

export function verifyMetaWebhook(req, res, next) {
  if (!isMetaRequestValid(req)) {
    return res.status(403).send('Invalid Meta webhook signature');
  }
  return next();
}
