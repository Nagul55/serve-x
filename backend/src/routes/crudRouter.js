import { Router } from 'express';
import { parseLimit, parseSort } from '../utils/sorting.js';
import { createNotification } from '../services/notification.service.js';

function sanitizePayload(payload) {
  const clean = { ...payload };
  for (const [key, value] of Object.entries(clean)) {
    if (value === '') {
      clean[key] = undefined;
    }
  }
  return clean;
}

export function createCrudRouter(model) {
  const router = Router();
  const modelName = model?.modelName || 'Record';

  function pickDisplayName(payload) {
    return payload?.title
      || payload?.need_title
      || payload?.full_name
      || payload?.reporter_name
      || payload?.location
      || payload?.email
      || payload?.id
      || '';
  }

  async function emitCrudNotification({ req, action, record, previousRecord }) {
    try {
      const actorEmail = req?.auth?.email || 'system';
      const actorUserId = req?.auth?.userId || '';
      const displayName = pickDisplayName(record);
      const quotedDisplayName = displayName ? `"${displayName}" ` : '';

      let title = `${modelName} ${action}`;
      let message = `${modelName} ${quotedDisplayName}was ${action} by ${actorEmail}.`;

      if (action === 'updated' && previousRecord?.status && record?.status && previousRecord.status !== record.status) {
        title = `${modelName} Status Updated`;
        message = `${modelName} ${quotedDisplayName}status changed from ${previousRecord.status} to ${record.status} by ${actorEmail}.`;
      }

      await createNotification({
        target_role: 'coordinator',
        target_user_id: actorUserId,
        type: `crud_${action}`,
        title,
        message,
        source: 'crud_router',
        source_ref_type: modelName,
        source_ref_id: String(record?.id || previousRecord?.id || ''),
        metadata: {
          action,
          modelName,
          actorEmail,
        },
      });
    } catch (error) {
      console.warn(`Failed to create ${modelName} ${action} notification: ${error.message}`);
    }
  }

  router.get('/', async (req, res, next) => {
    try {
      const sort = parseSort(req.query.sort);
      const limit = parseLimit(req.query.limit);

      const docs = await model.find({}).sort(sort).limit(limit);
      res.json(docs.map((d) => d.toJSON()));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const doc = await model.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json(doc.toJSON());
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const payload = sanitizePayload(req.body || {});
      const created = await model.create(payload);
      await emitCrudNotification({
        req,
        action: 'created',
        record: created?.toJSON?.() || created,
      });
      res.status(201).json(created.toJSON());
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const payload = sanitizePayload(req.body || {});
      const previous = await model.findById(req.params.id);
      const updated = await model.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
      });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      await emitCrudNotification({
        req,
        action: 'updated',
        record: updated?.toJSON?.() || updated,
        previousRecord: previous?.toJSON?.() || previous,
      });
      res.json(updated.toJSON());
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const deleted = await model.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      await emitCrudNotification({
        req,
        action: 'deleted',
        record: deleted?.toJSON?.() || deleted,
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
