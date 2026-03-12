const cron = require('node-cron');
const moment = require('moment-timezone');
const { getDb } = require('../config/db');
const { sendWhatsAppMessage } = require('./whatsappService');
const { sendTelegramMessage } = require('./telegramService');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

// CHANGE 3: Motivational messages (rotate through 10)
const MOTIVATIONAL_MESSAGES = [
  "Small actions today = big results tomorrow 🌟",
  "You've got this! Every step counts 💪",
  "Progress, not perfection 🎯",
  "Your future self will thank you ✨",
  "One task at a time, you're doing great! 🚀",
  "Consistency is key! Keep going 🔑",
  "Small wins lead to big victories 🏆",
  "You're building great habits! 🌱",
  "Every completed task is a win 🎉",
  "Believe in yourself, you can do it! 💫"
];

let motivationalIndex = 0;

/**
 * Get pending reminders that need to be sent
 * @returns {Promise<Array>}
 */
async function getPendingReminders() {
  try {
    const db = getDb();
    const result = await db.query(
      `SELECT r.*, u.phone_number, u.telegram_chat_id 
       FROM reminders r
       INNER JOIN users u ON r.user_id = u.id
       WHERE r.is_done = false AND r.remind_at <= CURRENT_TIMESTAMP
       ORDER BY r.remind_at ASC`
    );
    return result.rows;
  } catch (error) {
    console.error('[SCHEDULER] Error fetching pending reminders:', error);
    throw error;
  }
}

/**
 * Calculate next occurrence for recurring reminders
 * @param {Date} currentRemindAt - Current remind_at timestamp
 * @param {string} repeatType - daily/weekly/monthly
 * @returns {Date} - Next occurrence timestamp
 */
function calculateNextOccurrence(currentRemindAt, repeatType) {
  const current = moment.tz(currentRemindAt, TIMEZONE);
  let next;
  
  switch (repeatType) {
    case 'daily':
      next = current.add(1, 'days');
      break;
    case 'weekly':
      next = current.add(7, 'days');
      break;
    case 'monthly':
      next = current.add(1, 'months');
      break;
    default:
      return null;
  }
  
  return next.toDate();
}

/**
 * Get next motivational message
 * @returns {string}
 */
function getMotivationalMessage() {
  const message = MOTIVATIONAL_MESSAGES[motivationalIndex];
  motivationalIndex = (motivationalIndex + 1) % MOTIVATIONAL_MESSAGES.length;
  return message;
}

/**
 * Send reminder message to user (WhatsApp or Telegram)
 * @param {Object} reminder - Reminder object with user details
 */
async function sendReminderMessage(reminder) {
  // CHANGE 3: Add motivational message
  const motivational = getMotivationalMessage();
  
  const message = `🔔 Reminder: ${reminder.reminder_text}

Reply with:
1 or DONE — mark complete
2 or SNOOZE — remind in 2 hours
3 or RESCHEDULE — set new time

${motivational}`;

  try {
    // Check if user has Telegram or WhatsApp
    if (reminder.telegram_chat_id) {
      await sendTelegramMessage(reminder.telegram_chat_id, message);
      
      // Set conversation state for Telegram users
      const { setUserState } = require('./conversationService');
      setUserState(reminder.telegram_chat_id, 'waiting_reminder_action', { reminderId: reminder.id });
      
      console.log(`[SCHEDULER] ✓ Sent reminder ${reminder.id} to Telegram chat ${reminder.telegram_chat_id}`);
      return true;
    } else if (reminder.phone_number) {
      await sendWhatsAppMessage(reminder.phone_number, message);
      console.log(`[SCHEDULER] ✓ Sent reminder ${reminder.id} to WhatsApp ${reminder.phone_number}`);
      return true;
    } else {
      console.error(`[SCHEDULER] ✗ No contact info for reminder ${reminder.id}`);
      return false;
    }
  } catch (error) {
    console.error(`[SCHEDULER] ✗ Failed to send reminder ${reminder.id}:`, error.message);
    return false;
  }
}

/**
 * Update reminder after sending
 * @param {Object} reminder - Reminder object
 */
async function updateReminderAfterSending(reminder) {
  try {
    const db = getDb();
    const now = new Date();
    
    if (reminder.repeat_type === 'once') {
      // Non-recurring: update last_sent_at but don't mark as done yet
      // CHANGE 2: Allow follow-up after 45 minutes
      await db.query(
        'UPDATE reminders SET last_sent_at = $1 WHERE id = $2',
        [now, reminder.id]
      );
      console.log(`[SCHEDULER] ✓ Updated last_sent_at for reminder ${reminder.id} (non-recurring)`);
    } else {
      // Recurring: calculate next occurrence
      const nextRemindAt = calculateNextOccurrence(reminder.remind_at, reminder.repeat_type);
      
      if (nextRemindAt) {
        await db.query(
          'UPDATE reminders SET remind_at = $1, last_sent_at = $2 WHERE id = $3',
          [nextRemindAt, now, reminder.id]
        );
        
        const formattedNext = moment.tz(nextRemindAt, TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
        console.log(`[SCHEDULER] ✓ Updated reminder ${reminder.id} to next occurrence: ${formattedNext}`);
      }
    }
  } catch (error) {
    console.error(`[SCHEDULER] Error updating reminder ${reminder.id}:`, error);
    throw error;
  }
}

/**
 * CHANGE 2: Get reminders that need follow-up (45 minutes after sending, not marked DONE)
 * @returns {Promise<Array>}
 */
async function getRemindersNeedingFollowUp() {
  try {
    const db = getDb();
    const followUpTime = moment.tz(TIMEZONE).subtract(45, 'minutes').toDate();
    
    const result = await db.query(
      `SELECT r.*, u.phone_number, u.telegram_chat_id 
       FROM reminders r
       INNER JOIN users u ON r.user_id = u.id
       WHERE r.repeat_type = 'once' 
         AND r.is_done = false 
         AND r.follow_up_sent = false
         AND r.last_sent_at IS NOT NULL
         AND r.last_sent_at <= $1`,
      [followUpTime]
    );
    return result.rows;
  } catch (error) {
    console.error('[FOLLOW-UP] Error fetching reminders for follow-up:', error);
    throw error;
  }
}

/**
 * CHANGE 2: Send emotional follow-up message
 * @param {Object} reminder 
 */
async function sendFollowUpMessage(reminder) {
  const message = `Hey! Did you complete '${reminder.reminder_text}'?

Small steps matter. You've got this! 💪

Reply DONE if completed or SNOOZE to remind again.`;

  try {
    if (reminder.telegram_chat_id) {
      await sendTelegramMessage(reminder.telegram_chat_id, message);
      
      const { setUserState } = require('./conversationService');
      setUserState(reminder.telegram_chat_id, 'waiting_reminder_action', { reminderId: reminder.id });
      
      console.log(`[FOLLOW-UP] ✓ Sent follow-up for reminder ${reminder.id}`);
    } else if (reminder.phone_number) {
      await sendWhatsAppMessage(reminder.phone_number, message);
      console.log(`[FOLLOW-UP] ✓ Sent follow-up for reminder ${reminder.id}`);
    }
    
    // Mark follow-up as sent
    const db = getDb();
    await db.query(
      'UPDATE reminders SET follow_up_sent = true WHERE id = $1',
      [reminder.id]
    );
    
    return true;
  } catch (error) {
    console.error(`[FOLLOW-UP] Error sending follow-up for reminder ${reminder.id}:`, error);
    return false;
  }
}

/**
 * CHANGE 2: Process follow-up reminders
 */
async function processFollowUpReminders() {
  try {
    const reminders = await getRemindersNeedingFollowUp();
    
    if (reminders.length === 0) {
      return;
    }
    
    console.log(`\n[FOLLOW-UP] Found ${reminders.length} reminder(s) needing follow-up`);
    
    for (const reminder of reminders) {
      await sendFollowUpMessage(reminder);
    }
  } catch (error) {
    console.error('[FOLLOW-UP] Error processing follow-ups:', error);
  }
}

/**
 * Process all pending reminders
 */
async function processPendingReminders() {
  try {
    const pendingReminders = await getPendingReminders();
    
    if (pendingReminders.length === 0) {
      // Don't log when no reminders to avoid spam
      return;
    }
    
    console.log(`\n[SCHEDULER] Found ${pendingReminders.length} pending reminder(s)`);
    
    for (const reminder of pendingReminders) {
      console.log(`[SCHEDULER] Processing reminder ${reminder.id}: "${reminder.reminder_text}"`);
      
      // Send reminder message
      const sent = await sendReminderMessage(reminder);
      
      // Update reminder regardless of send status (for development/testing)
      // In production, you may want to retry failed sends
      if (!sent) {
        console.log(`[SCHEDULER] ⚠️  Message send failed but continuing with update`);
      }
      
      await updateReminderAfterSending(reminder);
    }
    
    console.log(`[SCHEDULER] Completed processing ${pendingReminders.length} reminder(s)\n`);
  } catch (error) {
    console.error('[SCHEDULER] Error processing pending reminders:', error);
  }
}

/**
 * Initialize the reminder scheduler
 * Runs every minute
 */
function initializeScheduler() {
  console.log('[SCHEDULER] Initializing reminder scheduler...');
  console.log('[SCHEDULER] Schedule: Every minute (* * * * *)');
  console.log('[SCHEDULER] Timezone:', TIMEZONE);
  
  // Schedule to run every minute
  cron.schedule('* * * * *', () => {
    const now = moment.tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    console.log(`[SCHEDULER] Running scheduled check at ${now}`);
    processPendingReminders();
    processFollowUpReminders(); // CHANGE 2: Also check for follow-ups
  });
  
  console.log('[SCHEDULER] ✓ Scheduler initialized successfully\n');
  
  // Run immediately on startup
  console.log('[SCHEDULER] Running initial check...');
  processPendingReminders();
  processFollowUpReminders();
}

/**
 * Mark reminder as done
 * @param {string} reminderId 
 * @returns {Promise<Object>}
 */
async function markReminderDone(reminderId) {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE reminders SET is_done = true WHERE id = $1 RETURNING *',
      [reminderId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error marking reminder as done:', error);
    throw error;
  }
}

/**
 * CHANGE 5: Snooze reminder by 2 hours and track snooze count
 * @param {string} reminderId 
 * @returns {Promise<Object>}
 */
async function snoozeReminder(reminderId) {
  try {
    const db = getDb();
    const newRemindAt = moment.tz(TIMEZONE).add(2, 'hours').toDate();
    
    // Get current snooze count and increment
    const countResult = await db.query(
      'SELECT snooze_count FROM reminders WHERE id = $1',
      [reminderId]
    );
    
    const currentSnoozeCount = countResult.rows[0]?.snooze_count || 0;
    const newSnoozeCount = currentSnoozeCount + 1;
    
    const result = await db.query(
      'UPDATE reminders SET remind_at = $1, snooze_count = $2 WHERE id = $3 RETURNING *',
      [newRemindAt, newSnoozeCount, reminderId]
    );
    
    return {
      ...result.rows[0],
      snooze_count: newSnoozeCount
    };
  } catch (error) {
    console.error('Error snoozing reminder:', error);
    throw error;
  }
}

module.exports = {
  initializeScheduler,
  processPendingReminders,
  markReminderDone,
  snoozeReminder,
  calculateNextOccurrence,
  getMotivationalMessage
};
