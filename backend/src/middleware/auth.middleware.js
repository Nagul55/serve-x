import { Session } from '../models/session.model.js';
import { User } from '../models/user.model.js';
import { verifyAccessJwt } from '../utils/auth.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    let payload;
    try {
      payload = verifyAccessJwt(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (payload?.typ !== 'access' || !payload?.sid || !payload?.jti) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const session = await Session.findOne({
      _id: payload.sid,
      access_jti: payload.jti,
      user_id: payload.sub,
      revoked_at: null,
      access_expires_at: { $gt: new Date() },
      refresh_expires_at: { $gt: new Date() },
    });

    if (!session) {
      return res.status(401).json({ error: 'Session is not active' });
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found for token' });
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      role: user.role,
      assignedCoordinatorId: user.assigned_coordinator_id?.toString() || null,
      accessJti: payload.jti,
      token,
      sessionId: session.id,
      fieldOfficerVerified: Boolean(session.field_officer_verified),
    };

    req.authSession = session;
    req.currentUser = user;
    next();
  } catch (error) {
    next(error);
  }
}
