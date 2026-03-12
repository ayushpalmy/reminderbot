const cron = require('node-cron');
const moment = require('moment-timezone');
const { getDb } = require('../config/db');
const { sendWhatsAppMessage } = require('./whatsappService');
const { sendTelegramMessage } = require('./telegramService');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

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
 * Send reminder message to user (WhatsApp or Telegram)
 * @param {Object} reminder - Reminder object with user details
 */
async function sendReminderMessage(reminder) {
  const message = `🔔 Reminder: ${reminder.reminder_text}

Reply with:
1 or DONE — mark complete
2 or SNOOZE — remind in 2 hours
3 or RESCHEDULE — set new time`;

  try {
    // Check if user has Telegram or WhatsApp
    if (reminder.telegram_chat_id) {
      await sendTelegramMessage(reminder.telegram_chat_id, message);
      
      // Set conversation state for Telegram users
      const { setUserState } = require('./conversationService');
      setUserState(reminder.telegram_chat_id, 'waiting_reminder_action', {});
      
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
      // Non-recurring: mark as done
      await db.query(
        'UPDATE reminders SET is_done = true, last_sent_at = $1 WHERE id = $2',
        [now, reminder.id]
      );
      console.log(`[SCHEDULER] ✓ Marked reminder ${reminder.id} as done (non-recurring)`);
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
  });
  
  console.log('[SCHEDULER] ✓ Scheduler initialized successfully\n');
  
  // Run immediately on startup
  console.log('[SCHEDULER] Running initial check...');
  processPendingReminders();
}

/**
 * Mark reminder as done
 * @param {string} reminderId 
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
 * Snooze reminder by 2 hours
 * @param {string} reminderId 
 */
async function snoozeReminder(reminderId) {
  try {
    const db = getDb();
    const newRemindAt = moment.tz(TIMEZONE).add(2, 'hours').toDate();
    
    const result = await db.query(
      'UPDATE reminders SET remind_at = $1 WHERE id = $2 RETURNING *',
      [newRemindAt, reminderId]
    );
    return result.rows[0] || null;
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
  calculateNextOccurrence
};
