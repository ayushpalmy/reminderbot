const { pool } = require('../config/db');
const moment = require('moment-timezone');

/**
 * Get dashboard statistics
 * @returns {Promise<Object>}
 */
async function getDashboardStats() {
  try {
    // Total users
    const totalUsersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(totalUsersResult.rows[0].count);
    
    // Free plan users
    const freePlanResult = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE plan_type = 'free'"
    );
    const freePlanUsers = parseInt(freePlanResult.rows[0].count);
    
    // Paid plan users
    const paidPlanResult = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE plan_type != 'free'"
    );
    const paidPlanUsers = parseInt(paidPlanResult.rows[0].count);
    
    // Total active reminders
    const activeRemindersResult = await pool.query(
      'SELECT COUNT(*) as count FROM reminders WHERE is_done = false'
    );
    const activeReminders = parseInt(activeRemindersResult.rows[0].count);
    
    // Reminders sent today
    const todayStart = moment().startOf('day').toDate();
    const remindersSentTodayResult = await pool.query(
      'SELECT COUNT(*) as count FROM reminders WHERE last_sent_at >= $1',
      [todayStart]
    );
    const remindersSentToday = parseInt(remindersSentTodayResult.rows[0].count);
    
    return {
      totalUsers,
      freePlanUsers,
      paidPlanUsers,
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
    const result = await pool.query(
      `SELECT id, phone_number, plan_type, created_at 
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
