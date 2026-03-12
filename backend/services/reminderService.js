const { getDb, ObjectId } = require('../config/db');

/**
 * Get count of active reminders for a user
 * @param {string} userId 
 * @returns {Promise<number>}
 */
async function getActiveReminderCount(userId) {
  try {
    const db = getDb();
    const count = await db.collection('reminders').countDocuments({
      user_id: userId,
      is_done: false
    });
    return count;
  } catch (error) {
    console.error('Error getting active reminder count:', error);
    throw error;
  }
}

/**
 * Create a new reminder
 * @param {string} userId 
 * @param {string} reminderText 
 * @param {Date} remindAt 
 * @param {string} repeatType 
 * @returns {Promise<Object>}
 */
async function createReminder(userId, reminderText, remindAt, repeatType = 'once') {
  try {
    const db = getDb();
    const reminder = {
      user_id: userId,
      reminder_text: reminderText,
      remind_at: new Date(remindAt),
      repeat_type: repeatType,
      is_done: false,
      last_sent_at: null,
      created_at: new Date()
    };
    
    const result = await db.collection('reminders').insertOne(reminder);
    console.log(`✓ Created reminder for user_id ${userId}: ${reminderText}`);
    
    return {
      ...reminder,
      id: result.insertedId.toString()
    };
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
    const reminders = await db.collection('reminders')
      .find({ user_id: userId })
      .sort({ remind_at: 1 })
      .toArray();
    
    return reminders.map(r => ({ ...r, id: r._id.toString() }));
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
    const reminders = await db.collection('reminders').aggregate([
      {
        $match: {
          is_done: false,
          remind_at: { $lte: new Date() }
        }
      },
      {
        $addFields: {
          user_object_id: { $toObjectId: '$user_id' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user_object_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          user_id: 1,
          reminder_text: 1,
          remind_at: 1,
          repeat_type: 1,
          is_done: 1,
          last_sent_at: 1,
          created_at: 1,
          phone_number: '$user.phone_number',
          telegram_chat_id: '$user.telegram_chat_id'
        }
      },
      {
        $sort: { remind_at: 1 }
      }
    ]).toArray();
    
    return reminders.map(r => ({ ...r, id: r._id.toString() }));
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
    await db.collection('reminders').updateOne(
      { _id: new ObjectId(reminderId) },
      { $set: { is_done: true } }
    );
    
    const reminder = await db.collection('reminders').findOne({ _id: new ObjectId(reminderId) });
    return reminder ? { ...reminder, id: reminder._id.toString() } : null;
  } catch (error) {
    console.error('Error marking reminder as done:', error);
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
    const reminder = await db.collection('reminders').findOne({ _id: new ObjectId(reminderId) });
    return reminder ? { ...reminder, id: reminder._id.toString() } : null;
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
  getReminderById
};
