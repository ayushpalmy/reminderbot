const { getDb } = require('../config/db');
const moment = require('moment-timezone');

/**
 * Get dashboard statistics
 * @returns {Promise<Object>}
 */
async function getDashboardStats() {
  try {
    const db = getDb();
    
    // Total users
    const totalUsers = await db.collection('users').countDocuments();
    
    // Free plan users
    const freePlanUsers = await db.collection('users').countDocuments({ plan_type: 'free' });
    
    // Paid plan users
    const paidPlanUsers = await db.collection('users').countDocuments({ plan_type: { $ne: 'free' } });
    
    // WhatsApp users
    const whatsappUsers = await db.collection('users').countDocuments({ phone_number: { $ne: null } });
    
    // Telegram users
    const telegramUsers = await db.collection('users').countDocuments({ telegram_chat_id: { $ne: null } });
    
    // Total active reminders
    const activeReminders = await db.collection('reminders').countDocuments({ is_done: false });
    
    // Reminders sent today
    const todayStart = moment().startOf('day').toDate();
    const remindersSentToday = await db.collection('reminders').countDocuments({
      last_sent_at: { $gte: todayStart }
    });
    
    return {
      totalUsers,
      freePlanUsers,
      paidPlanUsers,
      whatsappUsers,
      telegramUsers,
      activeReminders,
      remindersSentToday
    };
  } catch (error) {
    console.error('[ADMIN] Error getting dashboard stats:', error);
    throw error;
  }
}

/**
 * Get recent users
 * @param {number} limit 
 * @returns {Promise<Array>}
 */
async function getRecentUsers(limit = 10) {
  try {
    const db = getDb();
    const users = await db.collection('users')
      .find({})
      .project({ phone_number: 1, telegram_chat_id: 1, plan_type: 1, created_at: 1 })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    
    return users.map(user => ({
      id: user._id.toString(),
      phone_number: user.phone_number,
      telegram_chat_id: user.telegram_chat_id,
      plan_type: user.plan_type,
      created_at: user.created_at
    }));
  } catch (error) {
    console.error('[ADMIN] Error getting recent users:', error);
    throw error;
  }
}

module.exports = {
  getDashboardStats,
  getRecentUsers
};
