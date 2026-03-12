const { getDb } = require('../config/db');
const moment = require('moment-timezone');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

// In-memory store for user conversation state
// In production, consider using Redis or database
const userStates = new Map();

/**
 * Set user state (e.g., waiting for reschedule time)
 * @param {string} identifier - phone number or telegram chat id
 * @param {string} state - 'waiting_reschedule' or null
 * @param {Object} data - Additional state data
 */
function setUserState(identifier, state, data = {}) {
  userStates.set(identifier, {
    state,
    data,
    timestamp: Date.now()
  });
}

/**
 * Get user state
 * @param {string} identifier - phone number or telegram chat id
 * @returns {Object|null}
 */
function getUserState(identifier) {
  const state = userStates.get(identifier);
  
  // Clear state after 10 minutes
  if (state && Date.now() - state.timestamp > 600000) {
    userStates.delete(identifier);
    return null;
  }
  
  return state;
}

/**
 * Clear user state
 * @param {string} identifier - phone number or telegram chat id
 */
function clearUserState(identifier) {
  userStates.delete(identifier);
}

/**
 * Get most recently sent reminder for a user
 * @param {string} userId 
 * @returns {Promise<Object|null>}
 */
async function getMostRecentReminder(userId) {
  try {
    const db = getDb();
    const result = await db.query(
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
 * @param {string} userId 
 * @returns {Promise<Array>}
 */
async function getActiveRemindersFormatted(userId) {
  try {
    const db = getDb();
    const result = await db.query(
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
 * @param {string} reminderId 
 * @param {string} userId - For security check
 * @returns {Promise<boolean>}
 */
async function deleteReminder(reminderId, userId) {
  try {
    const db = getDb();
    const result = await db.query(
      'DELETE FROM reminders WHERE id = $1 AND user_id = $2',
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
 * @param {string} reminderId 
 * @param {Date} newRemindAt 
 * @returns {Promise<Object>}
 */
async function updateReminderTime(reminderId, newRemindAt) {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE reminders SET remind_at = $1 WHERE id = $2 RETURNING *',
      [newRemindAt, reminderId]
    );
    
    return result.rows[0] || null;
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
