import { Router } from 'express';
import { invokeLlm } from '../services/llmService.js';
import {
  getWhatsAppProviderConfigSummary,
  sendWhatsAppMessage,
  sendWhatsAppDispatch,
  sendWhatsAppMedia,
  sendWhatsAppLocation,
} from '../modules/survex/services/whatsappProvider.service.js';
import { env } from '../config/env.js';
import { normalizeWhatsAppPhone, sanitizeText } from '../modules/survex/utils/sanitize.js';
import { Volunteer } from '../models/volunteer.model.js';
import { Dispatch } from '../models/dispatch.model.js';
import { CommunityNeed } from '../models/communityNeed.model.js';
import { generateAssignmentPdf } from '../services/pdfService.js';

const router = Router();

const ASSIGNMENT_PRIORITIES = new Set(['low', 'normal', 'high', 'critical']);

const KNOWN_PLACE_COORDINATES = [
  {
    pattern: /\brasipuram\b/i,
    label: 'Rasipuram, Namakkal, Tamil Nadu, India',
    lat: 11.46009,
    lng: 78.18635,
  },
  {
    pattern: /\bgurusamipalayam\b/i,
    label: 'Gurusamipalayam, Rasipuram, Namakkal, Tamil Nadu, India',
    lat: 11.4268277,
    lng: 78.1312615,
  },
];

function toBool(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function extractProviderMessageId(sendResult) {
  const messageId = sanitizeText(sendResult?.providerResponse?.messages?.[0]?.id, 200);
  if (messageId) return messageId;
  return sanitizeText(sendResult?.providerResponse?.message_id, 200);
}

function requireCoordinator(req, res) {
  if (req.auth?.role !== 'coordinator') {
    res.status(403).json({ error: 'Only coordinators can perform this action' });
    return false;
  }
  return true;
}

function toCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getValidCoordinates(communityNeed) {
  const lat = toCoordinate(communityNeed?.location_coords?.lat);
  const lng = toCoordinate(communityNeed?.location_coords?.lng);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

function hasCoordinates(communityNeed) {
  return Boolean(getValidCoordinates(communityNeed));
}

function isGpsLabel(value) {
  return /^gps\s+-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/i.test(String(value || '').trim());
}

function getLocationDisplayName(communityNeed) {
  const location = sanitizeText(communityNeed?.location || '', 160);
  if (location && !isGpsLabel(location)) {
    return getKnownPlace(location)?.label || location;
  }

  if (!hasCoordinates(communityNeed)) {
    return location || 'Assigned site';
  }

  const { lat, lng } = getValidCoordinates(communityNeed);
  if (Math.abs(lat - 11.4268) < 0.02 && Math.abs(lng - 78.1313) < 0.02) {
    return 'Gurusamipalayam, Rasipuram, Namakkal, Tamil Nadu';
  }

  return 'Pinned field location';
}

function getKnownPlace(value) {
  const text = sanitizeText(value || '', 250);
  return KNOWN_PLACE_COORDINATES.find((place) => place.pattern.test(text)) || null;
}

function getMapsUrlFromCoords(coords) {
  if (!coords) return '';
  const { lat, lng } = coords;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function geocodeLocationName(locationName) {
  const location = sanitizeText(locationName || '', 250);
  if (!location) return null;

  const knownPlace = getKnownPlace(location);
  if (knownPlace) {
    return { lat: knownPlace.lat, lng: knownPlace.lng, label: knownPlace.label };
  }

  try {
    const query = /\bindia\b/i.test(location) ? location : `${location}, Tamil Nadu, India`;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');

    const response = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'ServeX-Bot (nagul@example.com)' } },
      5000
    );

    if (!response.ok) return null;
    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    const lat = toCoordinate(first?.lat);
    const lng = toCoordinate(first?.lon);
    if (lat === null || lng === null) return null;

    return {
      lat,
      lng,
      label: sanitizeText(first?.display_name || location, 180),
    };
  } catch (error) {
    console.warn(`[Integrations] Geocoding failed for "${location}": ${error.message}`);
    return null;
  }
}

async function resolveAssignmentLocation(communityNeed) {
  const existingCoords = getValidCoordinates(communityNeed);
  const locationName = getLocationDisplayName(communityNeed);

  if (existingCoords) {
    return {
      name: locationName,
      coords: existingCoords,
      mapsUrl: getMapsUrlFromCoords(existingCoords),
    };
  }

  const geocoded = await geocodeLocationName(locationName);
  if (!geocoded) {
    return {
      name: locationName,
      coords: null,
      mapsUrl: '',
    };
  }

  return {
    name: geocoded.label || locationName,
    coords: { lat: geocoded.lat, lng: geocoded.lng },
    mapsUrl: getMapsUrlFromCoords({ lat: geocoded.lat, lng: geocoded.lng }),
  };
}

function getNeedDisplayTitle({ communityNeed, needTitle }) {
  const title = sanitizeText(needTitle || communityNeed?.title || '', 180);
  const locationName = getLocationDisplayName(communityNeed);

  if (!title) {
    return locationName === 'Pinned field location' ? 'Community need at pinned field location' : `Community need in ${locationName}`;
  }

  if (isGpsLabel(communityNeed?.location) || /\bin GPS\s+-?\d/i.test(title)) {
    const category = sanitizeText(communityNeed?.category || 'community', 40).replace(/_/g, ' ');
    return `${category.charAt(0).toUpperCase()}${category.slice(1)} need at ${locationName}`;
  }

  return title;
}

router.get('/whatsapp/config', (_req, res) => {
  const summary = getWhatsAppProviderConfigSummary();

  return res.json({
    ...summary,
    webhookRoutes: {
      metaVerifyAndInbound: '/api/survex/webhooks/whatsapp/meta',
    },
  });
});

router.post('/whatsapp/send-test', async (req, res, next) => {
  try {
    const to = normalizeWhatsAppPhone(req.body?.to);
    const text = sanitizeText(req.body?.text, 3500);
    const provider = sanitizeText(req.body?.provider, 20).toLowerCase();

    if (!to || !text) {
      return res.status(400).json({ error: 'to and text are required' });
    }

    if (provider && provider !== 'meta') {
      return res.status(400).json({ error: 'provider must be meta when supplied' });
    }

    const result = await sendWhatsAppMessage({
      to,
      text,
      provider: 'meta',
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/llm', async (req, res, next) => {
  try {
    const { prompt = '', response_json_schema: responseSchema } = req.body || {};
    const messages = [{ role: 'user', content: String(prompt) }];
    const result = await invokeLlm(messages, responseSchema || undefined);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/volunteers/:volunteerId/assign-chatbot-task', async (req, res, next) => {
  try {
    if (!requireCoordinator(req, res)) {
      return;
    }

    const task = sanitizeText(req.body?.task, 1000);
    const needTitle = sanitizeText(req.body?.need_title, 140);
    const dueDate = sanitizeText(req.body?.due_date, 40);
    const priorityInput = sanitizeText(req.body?.priority, 20).toLowerCase();
    const priority = ASSIGNMENT_PRIORITIES.has(priorityInput) ? priorityInput : 'normal';
    const createDispatch = toBool(req.body?.create_dispatch, true);

    if (!task) {
      return res.status(400).json({ error: 'task is required' });
    }

    const volunteer = await Volunteer.findById(req.params.volunteerId);
    if (!volunteer) {
      return res.status(404).json({ error: 'Volunteer not found' });
    }

    const assignedCoordinatorId = volunteer.assigned_coordinator_id?.toString() || null;
    if (assignedCoordinatorId && assignedCoordinatorId !== req.auth.userId) {
      return res.status(403).json({ error: 'Volunteer is assigned to another coordinator' });
    }

    // Use phone from request body if coordinator explicitly provided one, else use DB phone
    const rawPhone = req.body?.phone ? normalizeWhatsAppPhone(req.body.phone) : normalizeWhatsAppPhone(volunteer.phone);
    const phone = rawPhone || normalizeWhatsAppPhone(volunteer.phone);
    if (!phone) {
      return res.status(400).json({ error: 'Volunteer does not have a phone number registered. Please update their profile first.' });
    }

    const coordinatorName = sanitizeText(req.currentUser?.name, 80) || 'ServeX Coordinator';
    const volunteerName = sanitizeText(volunteer.full_name, 80) || 'Volunteer';

    const needId = req.body?.need_id;
    let communityNeed = null;
    if (needId) {
      communityNeed = await CommunityNeed.findById(needId);
    }
    const assignmentLocation = await resolveAssignmentLocation(communityNeed);
    const locationName = assignmentLocation.name;
    const mapsUrl = assignmentLocation.mapsUrl;
    const displayNeedTitle = getNeedDisplayTitle({ communityNeed, needTitle });

    const messageLines = [
      'ServeX Assignment',
      `Hi ${volunteerName},`,
      `${coordinatorName} assigned you a new task:`,
      task,
    ];

    if (displayNeedTitle) messageLines.push(`Need: ${displayNeedTitle}`);
    if (locationName) messageLines.push(`Location: ${locationName}`);
    messageLines.push(`Priority: ${priority.toUpperCase()}`);
    if (dueDate) messageLines.push(`Due: ${dueDate}`);

    messageLines.push('Please acknowledge this assignment and share updates after completion.');

    let sendResult = null;
    let messageSid = '';
    const baseUrl = env.servexWhatsAppPublicUrl;
    
    try {
      // 1. Send text notification
      sendResult = await sendWhatsAppDispatch({
        to: phone,
        text: messageLines.join('\n'),
      });
      messageSid = extractProviderMessageId(sendResult) || '';

      if (assignmentLocation.coords) {
        try {
          await sendWhatsAppLocation({
            to: phone,
            latitude: assignmentLocation.coords.lat,
            longitude: assignmentLocation.coords.lng,
          });
          console.log(`[Integrations] WhatsApp location card sent to ${phone}: ${assignmentLocation.coords.lat}, ${assignmentLocation.coords.lng}`);
        } catch (locationError) {
          console.warn(`[Integrations] WhatsApp location card failed for ${phone}: ${locationError.message}`);
        }
      }

      // 2. Generate and send professional PDF
      try {
        const pdfPath = await generateAssignmentPdf({
          volunteerName,
          task,
          needTitle,
          priority,
          dueDate,
          location: locationName,
          mapsUrl,
        });

        if (pdfPath) {
          await sendWhatsAppMedia({
            to: phone,
            mediaUrl: `${baseUrl}${pdfPath}`,
            mediaPath: pdfPath,
            type: 'document',
            caption: `Assignment Brief: ${needTitle || 'Task'}`,
          });
          console.log(`[Integrations] Assignment PDF sent to ${phone}: ${pdfPath}`);
        }
      } catch (pdfError) {
        console.warn(`[Integrations] Assignment PDF failed for ${phone}: ${pdfError.message}`);
      }

      // 3. If there is a field photo, send it as a follow-up
      if (communityNeed?.photo_url) {
        await sendWhatsAppMedia({
          to: phone,
          mediaUrl: `${baseUrl}${communityNeed.photo_url}`,
          type: 'image',
          caption: `Field photo for: ${needTitle || 'Assignment'}`,
        });
      }
    } catch (error) {
      const errMsg = error.message || '';
      console.error(`[Integrations] WhatsApp send failed for ${phone}: ${errMsg}`);
      // Surface Meta-specific errors clearly so the coordinator knows
      if (errMsg.includes('131030') || errMsg.includes('not in allowed list')) {
        return res.status(400).json({
          error: `WhatsApp message failed: The number ${phone} is not yet verified in your Meta test recipient list. Go to Meta Developer Console → API Setup → "To" dropdown → "Manage phone number list" and verify this number first.`,
          code: 'META_RECIPIENT_NOT_ALLOWED',
          phone,
        });
      }
      return res.status(502).json({
        error: `WhatsApp delivery failed: ${errMsg}`,
        code: 'WHATSAPP_SEND_FAILED',
        phone,
      });
    }

    volunteer.assigned_coordinator_id = req.auth.userId;
    volunteer.last_assignment_note = task;
    volunteer.last_assignment_priority = priority;
    volunteer.last_assignment_at = new Date();
    volunteer.last_assignment_message_sid = messageSid;
    await volunteer.save();

    let dispatch = null;
    if (createDispatch) {
      dispatch = await Dispatch.create({
        need_id: sanitizeText(req.body?.need_id, 120) || `manual-${Date.now()}`,
        need_title: displayNeedTitle || 'Coordinator chatbot assignment',
        volunteer_ids: [volunteer.id],
        volunteer_names: [volunteer.full_name],
        status: 'pending',
        notes: task,
        scheduled_date: null,
      });
    }

    return res.json({
      ok: true,
      volunteer: volunteer.toJSON(),
      dispatch: dispatch ? dispatch.toJSON() : null,
      whatsapp: sendResult,
      assignment_only: !createDispatch,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
