const { getDb } = require('../config/db');
const { incrementDailyCount } = require('./streakService');

/**
 * Get count of active reminders for a user
 * @param {string} userId 
 * @returns {Promise<number>}
 */
async function getActiveReminderCount(userId) {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT COUNT(*) as count FROM reminders WHERE user_id = $1 AND is_done = false',
      [userId]
    );
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting active reminder count:', error);
    throw error;
  }
}

/**
 * Create a new reminder (CHANGE 1: Increment daily count for paid plans)
 * @param {string} userId 
 * @param {string} reminderText 
 * @param {Date} remindAt 
 * @param {string} repeatType 
 * @returns {Promise<Object>}
 */
async function createReminder(userId, reminderText, remindAt, repeatType = 'once') {
  try {
    const db = getDb();
    const result = await db.query(
      `INSERT INTO reminders (user_id, reminder_text, remind_at, repeat_type) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [userId, reminderText, remindAt, repeatType]
    );
    
    // CHANGE 1: Increment daily count for paid plans
    const userResult = await db.query('SELECT plan_type FROM users WHERE id = $1', [userId]);
    if (userResult.rows[0] && userResult.rows[0].plan_type !== 'free') {
      await incrementDailyCount(userId);
    }
    
    console.log(`✓ Created reminder for user_id ${userId}: ${reminderText}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating reminder:', error);
    throw error;
  }
}

/**
 * Get all reminders for a user
 * @param {string} userId 
 * @returns {Promise<Array>}
 */
async function getUserReminders(userId) {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT * FROM reminders WHERE user_id = $1 ORDER BY remind_at ASC',
      [userId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting user reminders:', error);
    throw error;
  }
}

/**
 * Get pending reminders (not done and time has passed)
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
    console.error('Error getting pending reminders:', error);
    throw error;
  }
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
 * Update last_sent_at timestamp for a reminder
 * @param {string} reminderId 
 * @returns {Promise<Object>}
 */
async function updateLastSentAt(reminderId) {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE reminders SET last_sent_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [reminderId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error updating last_sent_at:', error);
    throw error;
  }
}

/**
 * Get reminder by ID
 * @param {string} reminderId 
 * @returns {Promise<Object|null>}
 */
async function getReminderById(reminderId) {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT * FROM reminders WHERE id = $1',
      [reminderId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting reminder by ID:', error);
    throw error;
  }
}

module.exports = {
  getActiveReminderCount,
  createReminder,
  getUserReminders,
  getPendingReminders,
  markReminderDone,
  updateLastSentAt,
  getReminderById
};
