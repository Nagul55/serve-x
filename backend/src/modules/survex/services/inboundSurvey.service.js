import { SurvexUser } from '../models/survexUser.model.js';
import { Volunteer } from '../../../models/volunteer.model.js';
import { continueSurveyConversation } from './surveyConversation.service.js';
import { processVolunteerMessage } from './volunteerBot.service.js';

export async function processInboundSurveyMessage({
  from,
  to,
  body,
  messageSid,
  messageType = 'text',
  mediaId = '',
  location = null,
}) {
  const fieldOfficer = await SurvexUser.findOne({
    phone: from,
    role: 'field_officer',
    is_active: true,
  });

  if (!fieldOfficer) {
    // Check if it's a volunteer instead
    const volunteer = await Volunteer.findOne({
      phone: from,
      status: 'active'
    });

    if (volunteer) {
      console.log(`[Survex] Routing message to volunteer bot for ${from}`);
      return await processVolunteerMessage({
        volunteer,
        inboundText: body,
        from,
      });
    }

    // Log the unregistered number so admin can add them
    console.warn(`[Survex] Unregistered number attempted survey: ${from} | Message: "${String(body || '').substring(0, 80)}"`);
    return {
      type: 'rejected',
      message: [
        '👋 Welcome to ServeX!',
        '',
        'Your number is not yet registered as a Field Officer.',
        `Your number: ${from}`,
        '',
        'Please ask your coordinator to register your number at:',
        'POST /api/setup/register-survex-field-officer',
        '',
        'Once registered, send "Hey servex" to start a survey.',
      ].join('\n'),
    };
  }

  if (!fieldOfficer.assignedCoordinatorId) {
    // Try to auto-assign to the first available coordinator
    const coordinator = await SurvexUser.findOne({ role: 'coordinator', is_active: true }).sort({ created_date: 1 });
    if (coordinator) {
      fieldOfficer.assignedCoordinatorId = coordinator._id;
      await fieldOfficer.save();
      console.log(`[Survex] Auto-assigned ${from} to coordinator ${coordinator.id}`);
    } else {
      return {
        type: 'rejected',
        message: 'No coordinator found. Please contact your ServeX admin.',
      };
    }
  }

  let result;
  try {
    result = await continueSurveyConversation({
      fieldOfficer,
      coordinatorId: fieldOfficer.assignedCoordinatorId,
      inboundText: body,
      from,
      to,
      messageSid,
      messageType,
      mediaId,
      location,
    });
  } catch (error) {
    console.error(`[Survex] Error in continueSurveyConversation for ${from}:`, error.message);
    return {
      type: 'error',
      message: '⚠️ Sorry, I encountered an internal error while processing your message. Please try again or contact your coordinator.',
    };
  }

  return {
    ...result,
    message: result?.message || 'Unable to process message at the moment. Please retry.',
  };
}
