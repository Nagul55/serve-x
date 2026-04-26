import { Router } from 'express';
import { Notification } from '../models/notification.model.js';
import { parseLimit } from '../utils/sorting.js';

const router = Router();

function buildNotificationQuery(auth) {
  const role = auth?.role || '';
  const userId = auth?.userId || '';

  return {
    $and: [
      {
        $or: [
          { target_role: 'all' },
          { target_role: role },
        ],
      },
      {
        $or: [
          { target_user_id: '' },
          { target_user_id: userId },
        ],
      },
    ],
  };
}

router.get('/', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const query = buildNotificationQuery(req.auth);

    const [items, unreadCount] = await Promise.all([
      Notification.find(query).sort({ created_date: -1 }).limit(limit),
      Notification.countDocuments({
        ...query,
        is_read: false,
      }),
    ]);

    res.json({
      items: items.map((item) => item.toJSON()),
      unread_count: unreadCount,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const query = buildNotificationQuery(req.auth);
    const updated = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        ...query,
      },
      {
        is_read: true,
        read_at: new Date(),
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(updated.toJSON());
  } catch (error) {
    next(error);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    const query = buildNotificationQuery(req.auth);
    const result = await Notification.updateMany(
      {
        ...query,
        is_read: false,
      },
      {
        is_read: true,
        read_at: new Date(),
      }
    );

    res.json({
      success: true,
      modified_count: result.modifiedCount || 0,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
