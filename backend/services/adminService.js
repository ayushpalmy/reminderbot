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
    const totalUsersResult = await db.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(totalUsersResult.rows[0].count);
    
    // Free plan users
    const freePlanResult = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE plan_type = 'free'"
    );
    const freePlanUsers = parseInt(freePlanResult.rows[0].count);
    
    // Paid plan users
    const paidPlanResult = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE plan_type != 'free'"
    );
    const paidPlanUsers = parseInt(paidPlanResult.rows[0].count);
    
    // WhatsApp users
    const whatsappResult = await db.query(
      'SELECT COUNT(*) as count FROM users WHERE phone_number IS NOT NULL'
    );
    const whatsappUsers = parseInt(whatsappResult.rows[0].count);
    
    // Telegram users
    const telegramResult = await db.query(
      'SELECT COUNT(*) as count FROM users WHERE telegram_chat_id IS NOT NULL'
    );
    const telegramUsers = parseInt(telegramResult.rows[0].count);
    
    // Total active reminders
    const activeRemindersResult = await db.query(
      'SELECT COUNT(*) as count FROM reminders WHERE is_done = false'
    );
    const activeReminders = parseInt(activeRemindersResult.rows[0].count);
    
    // Reminders sent today
    const todayStart = moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const remindersSentTodayResult = await db.query(
      'SELECT COUNT(*) as count FROM reminders WHERE last_sent_at >= $1',
      [todayStart]
    );
    const remindersSentToday = parseInt(remindersSentTodayResult.rows[0].count);
    
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
    const result = await db.query(
      `SELECT id, phone_number, telegram_chat_id, plan_type, created_at 
       FROM users 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error('[ADMIN] Error getting recent users:', error);
    throw error;
  }
}

module.exports = {
  getDashboardStats,
  getRecentUsers
};
