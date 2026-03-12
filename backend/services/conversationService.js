const { getDb, ObjectId } = require('../config/db');
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
    const reminder = await db.collection('reminders')
      .findOne(
        { user_id: userId, is_done: false },
        { sort: { last_sent_at: -1, created_at: -1 } }
      );
    
    return reminder ? { ...reminder, id: reminder._id.toString() } : null;
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
    const reminders = await db.collection('reminders')
      .find({ user_id: userId, is_done: false })
      .sort({ remind_at: 1 })
      .toArray();
    
    return reminders.map((reminder, index) => {
      const remindTime = moment.tz(reminder.remind_at, TIMEZONE);
      const formatted = remindTime.format('Do MMM, h:mm A');
      const repeatInfo = reminder.repeat_type !== 'once' ? ` (${reminder.repeat_type})` : '';
      
      return {
        number: index + 1,
        id: reminder._id.toString(),
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
    const result = await db.collection('reminders').deleteOne({
      _id: new ObjectId(reminderId),
      user_id: userId
    });
    
    return result.deletedCount > 0;
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
    await db.collection('reminders').updateOne(
      { _id: new ObjectId(reminderId) },
      { $set: { remind_at: new Date(newRemindAt) } }
    );
    
    const reminder = await db.collection('reminders').findOne({ _id: new ObjectId(reminderId) });
    return reminder ? { ...reminder, id: reminder._id.toString() } : null;
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
