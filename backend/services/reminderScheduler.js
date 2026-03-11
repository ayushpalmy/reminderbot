const cron = require('node-cron');
const moment = require('moment-timezone');
const { pool } = require('../config/db');
const { sendWhatsAppMessage } = require('./whatsappService');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

/**
 * Get pending reminders that need to be sent
 * @returns {Promise<Array>}
 */
async function getPendingReminders() {
  try {
    const result = await pool.query(`
      SELECT r.*, u.phone_number 
      FROM reminders r 
      JOIN users u ON r.user_id = u.id 
      WHERE r.is_done = false 
        AND r.remind_at <= NOW()
      ORDER BY r.remind_at ASC
    `);
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
 * Send reminder message to user
 * @param {Object} reminder - Reminder object with user details
 */
async function sendReminderMessage(reminder) {
  const message = `🔔 Reminder: ${reminder.reminder_text}

Reply with:
DONE — to mark complete
SNOOZE — to remind in 2 hours
RESCHEDULE — to set a new time`;

  try {
    await sendWhatsAppMessage(reminder.phone_number, message);
    console.log(`[SCHEDULER] ✓ Sent reminder ${reminder.id} to ${reminder.phone_number}`);
    return true;
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
    const now = new Date();
    
    if (reminder.repeat_type === 'once') {
      // Non-recurring: mark as done
      await pool.query(
        'UPDATE reminders SET is_done = true, last_sent_at = $1 WHERE id = $2',
        [now, reminder.id]
      );
      console.log(`[SCHEDULER] ✓ Marked reminder ${reminder.id} as done (non-recurring)`);
    } else {
      // Recurring: calculate next occurrence
      const nextRemindAt = calculateNextOccurrence(reminder.remind_at, reminder.repeat_type);
      
      if (nextRemindAt) {
        await pool.query(
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
        console.log(`[SCHEDULER] ⚠️  WhatsApp send failed but continuing with update`);
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
 * @param {number} reminderId 
 */
async function markReminderDone(reminderId) {
  try {
    const result = await pool.query(
      'UPDATE reminders SET is_done = true WHERE id = $1 RETURNING *',
      [reminderId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error marking reminder as done:', error);
    throw error;
  }
}

/**
 * Snooze reminder by 2 hours
 * @param {number} reminderId 
 */
async function snoozeReminder(reminderId) {
  try {
    const newRemindAt = moment.tz(TIMEZONE).add(2, 'hours').toDate();
    const result = await pool.query(
      'UPDATE reminders SET remind_at = $1 WHERE id = $2 RETURNING *',
      [newRemindAt, reminderId]
    );
    return result.rows[0];
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
