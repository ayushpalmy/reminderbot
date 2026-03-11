const { pool } = require('../config/db');
const moment = require('moment-timezone');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

// In-memory store for user conversation state
// In production, consider using Redis or database
const userStates = new Map();

/**
 * Set user state (e.g., waiting for reschedule time)
 * @param {string} phoneNumber 
 * @param {string} state - 'waiting_reschedule' or null
 * @param {Object} data - Additional state data
 */
function setUserState(phoneNumber, state, data = {}) {
  userStates.set(phoneNumber, {
    state,
    data,
    timestamp: Date.now()
  });
}

/**
 * Get user state
 * @param {string} phoneNumber 
 * @returns {Object|null}
 */
function getUserState(phoneNumber) {
  const state = userStates.get(phoneNumber);
  
  // Clear state after 10 minutes
  if (state && Date.now() - state.timestamp > 600000) {
    userStates.delete(phoneNumber);
    return null;
  }
  
  return state;
}

/**
 * Clear user state
 * @param {string} phoneNumber 
 */
function clearUserState(phoneNumber) {
  userStates.delete(phoneNumber);
}

/**
 * Get most recently sent reminder for a user
 * @param {number} userId 
 * @returns {Promise<Object|null>}
 */
async function getMostRecentReminder(userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM reminders 
       WHERE user_id = $1 AND is_done = false 
       ORDER BY last_sent_at DESC NULLS LAST, created_at DESC 
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting most recent reminder:', error);
    throw error;
  }
}

/**
 * Get all active reminders for a user with formatting
 * @param {number} userId 
 * @returns {Promise<Array>}
 */
async function getActiveRemindersFormatted(userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM reminders 
       WHERE user_id = $1 AND is_done = false 
       ORDER BY remind_at ASC`,
      [userId]
    );
    
    return result.rows.map((reminder, index) => {
      const remindTime = moment.tz(reminder.remind_at, TIMEZONE);
      const formatted = remindTime.format('Do MMM, h:mm A');
      const repeatInfo = reminder.repeat_type !== 'once' ? ` (${reminder.repeat_type})` : '';
      
      return {
        number: index + 1,
        id: reminder.id,
        text: reminder.reminder_text,
        time: formatted,
        repeat: repeatInfo,
        displayText: `${index + 1}. ${reminder.reminder_text}\n   ⏰ ${formatted}${repeatInfo}`
      };
    });
  } catch (error) {
    console.error('Error getting active reminders:', error);
    throw error;
  }
}

/**
 * Delete a reminder by ID
 * @param {number} reminderId 
 * @param {number} userId - For security check
 * @returns {Promise<boolean>}
 */
async function deleteReminder(reminderId, userId) {
  try {
    const result = await pool.query(
      'DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING *',
      [reminderId, userId]
    );
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting reminder:', error);
    throw error;
  }
}

/**
 * Update reminder time
 * @param {number} reminderId 
 * @param {Date} newRemindAt 
 * @returns {Promise<Object>}
 */
async function updateReminderTime(reminderId, newRemindAt) {
  try {
    const result = await pool.query(
      'UPDATE reminders SET remind_at = $1 WHERE id = $2 RETURNING *',
      [newRemindAt, reminderId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error updating reminder time:', error);
    throw error;
  }
}

module.exports = {
  setUserState,
  getUserState,
  clearUserState,
  getMostRecentReminder,
  getActiveRemindersFormatted,
  deleteReminder,
  updateReminderTime
};
