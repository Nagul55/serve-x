import { Volunteer } from '../../../models/volunteer.model.js';
import { Dispatch } from '../../../models/dispatch.model.js';

const STATE_IDLE = 'IDLE';
const STATE_AWAITING_TASK_CONFIRM = 'AWAITING_TASK_CONFIRM';
const STATE_TASK_ACTIVE = 'TASK_ACTIVE';

const HELP_KEYWORDS = ['help', 'hi', 'hello', 'menu'];
const STATUS_KEYWORDS = ['status', 'my task'];

export async function processVolunteerMessage({
  volunteer,
  inboundText,
  from,
}) {
  const msg = (inboundText || '').trim().toLowerCase();
  const name = volunteer.full_name || 'Volunteer';
  
  // Basic volunteer state machine
  let state = volunteer.bot_state || STATE_IDLE;
  
  if (HELP_KEYWORDS.includes(msg)) {
    return {
      type: 'text',
      message: [
        `🌿 *ServeX Volunteer Menu — ${name}*`,
        '',
        'You can use these commands at any time:',
        '📊 *status* — View your current active task',
        '✅ *done* — Mark your task as completed',
        '❓ *help* — Show this menu',
        '',
        '_When you receive an assignment, simply reply with YES to accept or NO to decline._',
      ].join('\n'),
    };
  }


  if (STATUS_KEYWORDS.includes(msg)) {
    const activeDispatch = await Dispatch.findOne({ 
      volunteer_ids: volunteer.id,
      status: 'active'
    }).sort({ created_date: -1 });

    if (!activeDispatch) {
      return {
        type: 'text',
        message: [
          `📊 *Your Status — ${name}*`,
          '',
          'Currently, you have *no active tasks*.',
          'Relax! We will ping you as soon as a community needs your help. 🕊️',
        ].join('\n'),
      };
    }
    return {
      type: 'text',
      message: [
        `📊 *Active Assignment — ${name}*`,
        '',
        `🔧 *Task:* ${activeDispatch.need_title}`,
        `📍 *Status:* In Progress`,
        '',
        'Type *done* when you have completed this work to notify the coordinator! ✅',
      ].join('\n'),
    };
  }

  // If volunteer replies to "Hello World" (or sends any generic text) and has a recent assignment
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  if (volunteer.last_assignment_at && volunteer.last_assignment_at > fifteenMinutesAgo && volunteer.last_assignment_note) {
    if (msg === 'yes' || msg === 'y' || msg === 'confirm') {
      const pendingDispatch = await Dispatch.findOne({
        volunteer_ids: volunteer.id,
        status: 'pending'
      });
      
      if (pendingDispatch) {
        pendingDispatch.status = 'active';
        await pendingDispatch.save();
        volunteer.bot_state = STATE_TASK_ACTIVE;
        await volunteer.save();
        return {
          type: 'text',
          message: [
            `✅ *Awesome, ${name}!*`,
            '',
            'Your coordinator has been notified that you are on the case.',
            '',
            `🚀 *Task:* ${pendingDispatch.need_title}`,
            `📝 *Notes:* ${pendingDispatch.notes}`,
            '',
            '_Type "done" once you finish the work! Good luck!_',
          ].join('\n'),
        };
      }
    }

    if (msg === 'no' || msg === 'n') {
      return {
        type: 'text',
        message: `No problem at all, ${name}! I've notified the coordinator. I'll reach out again when the next task comes up. 😊`,
      };
    }

    return {
      type: 'text',
      message: [
        `📋 *Assignment Brief for ${name}*`,
        '',
        volunteer.last_assignment_note,
        '',
        'Would you like to take this on? Reply with *YES* to accept or *NO* to decline.',
      ].join('\n'),
    };
  }

  if (msg === 'done' || msg === 'completed') {
    const activeDispatch = await Dispatch.findOne({
      volunteer_ids: volunteer.id,
      status: 'active'
    });
    if (activeDispatch) {
      activeDispatch.status = 'resolved';
      await activeDispatch.save();
      volunteer.bot_state = STATE_IDLE;
      await volunteer.save();
      return {
        type: 'text',
        message: [
          `🎉 *Fantastic job, ${name}!*`,
          '',
          'The task has been marked as resolved. The coordinator is very thankful for your support!',
          '',
          '_Your reliability score has been boosted! 🚀_',
        ].join('\n'),
      };
    }
  }

  // Default response
  return {
    type: 'text',
    message: `👋 *Hi ${name}!*`,
  };
}
