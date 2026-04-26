import { Router } from 'express';
import { SurvexSurvey } from '../models/survexSurvey.model.js';
import { requireCoordinator, requireSurvexAuth } from '../middleware/survexAuth.js';
import { sanitizeText } from '../utils/sanitize.js';
import { CommunityNeed } from '../../../models/communityNeed.model.js';

const router = Router();

async function attachLinkedNeeds(surveys) {
  const surveyIds = surveys.map((survey) => survey.id).filter(Boolean);
  if (!surveyIds.length) {
    return new Map();
  }

  const needs = await CommunityNeed.find({
    source_ref_type: 'survex_survey',
    source_ref_id: { $in: surveyIds },
  })
    .select('source_ref_id status title urgency_level')
    .lean();

  return new Map(needs.map((need) => [String(need.source_ref_id), need]));
}

router.use(requireSurvexAuth);

router.get('/', async (req, res, next) => {
  try {
    const q = sanitizeText(req.query?.q || '', 80);
    const status = sanitizeText(req.query?.status || '', 20).toLowerCase();

    const query = {};
    if (req.survexAuth.role === 'coordinator') {
      query.coordinatorId = req.survexAuth.userId;
    } else {
      query.fieldOfficerId = req.survexAuth.userId;
    }

    if (status === 'pending' || status === 'resolved') {
      query.status = status;
    }

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { rawMessage: rx },
        { 'surveyData.name': rx },
        { 'surveyData.location': rx },
        { 'surveyData.issue': rx },
      ];
    }

    const surveys = await SurvexSurvey.find(query)
      .sort({ timestamp: -1 })
      .limit(300)
      .populate('fieldOfficerId', 'name phone role')
      .populate('coordinatorId', 'name phone role');

    const linkedNeedBySurveyId = await attachLinkedNeeds(surveys);

    return res.json(surveys.map((survey) => ({
      id: survey.id,
      fieldOfficer: survey.fieldOfficerId,
      coordinator: survey.coordinatorId,
      surveyData: survey.surveyData,
      timestamp: survey.timestamp,
      status: survey.status,
      source: survey.source,
      rawMessage: survey.rawMessage,
      meta: survey.meta,
      linkedNeed: (() => {
        const need = linkedNeedBySurveyId.get(survey.id);
        if (!need) return null;
        return {
          id: need.id,
          status: need.status,
          title: need.title,
          urgency_level: need.urgency_level,
        };
      })(),
    })));
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/status', requireCoordinator, async (req, res, next) => {
  try {
    const status = sanitizeText(req.body?.status || '', 20).toLowerCase();
    if (!['pending', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending or resolved' });
    }

    const survey = await SurvexSurvey.findOne({
      _id: req.params.id,
      coordinatorId: req.survexAuth.userId,
    });

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    survey.status = status;
    await survey.save();

    const linkedNeed = await CommunityNeed.findOne({
      source_ref_type: 'survex_survey',
      source_ref_id: survey.id,
    });

    if (linkedNeed) {
      if (status === 'resolved') {
        linkedNeed.status = 'resolved';
      } else if (status === 'pending' && linkedNeed.status === 'resolved') {
        linkedNeed.status = 'unaddressed';
      }

      await linkedNeed.save();
    }

    return res.json({
      id: survey.id,
      status: survey.status,
      linkedNeed: linkedNeed
        ? {
            id: linkedNeed.id,
            status: linkedNeed.status,
          }
        : null,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
