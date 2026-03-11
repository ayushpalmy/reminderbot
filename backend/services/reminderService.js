const { pool } = require('../config/db');

/**
 * Get count of active reminders for a user
 * @param {number} userId 
 * @returns {Promise<number>}
 */
async function getActiveReminderCount(userId) {
  try {
    const result = await pool.query(
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
 * Create a new reminder
 * @param {number} userId 
 * @param {string} reminderText 
 * @param {Date} remindAt 
 * @param {string} repeatType 
 * @returns {Promise<Object>}
 */
async function createReminder(userId, reminderText, remindAt, repeatType = 'once') {
  try {
    const result = await pool.query(
      `INSERT INTO reminders (user_id, reminder_text, remind_at, repeat_type, is_done) 
       VALUES ($1, $2, $3, $4, false) 
       RETURNING *`,
      [userId, reminderText, remindAt, repeatType]
    );
    console.log(`✓ Created reminder for user_id ${userId}: ${reminderText}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating reminder:', error);
    throw error;
  }
}

/**
 * Get all reminders for a user
 * @param {number} userId 
 * @returns {Promise<Array>}
 */
async function getUserReminders(userId) {
  try {
    const result = await pool.query(
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
    const result = await pool.query(
      `SELECT r.*, u.phone_number 
       FROM reminders r 
       JOIN users u ON r.user_id = u.id 
       WHERE r.is_done = false AND r.remind_at <= NOW()
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
 * @param {number} reminderId 
 * @returns {Promise<Object>}
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

module.exports = {
  getActiveReminderCount,
  createReminder,
  getUserReminders,
  getPendingReminders,
  markReminderDone
};