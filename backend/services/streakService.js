const { getDb } = require('../config/db');
const moment = require('moment-timezone');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

// Daily reminder limits by plan
const DAILY_LIMITS = {
  free: 3, // Total active reminders (not daily)
  personal: 30,
  family: 40
};

/**
 * Check if user has reached daily reminder limit
 * @param {string} userId 
 * @param {string} planType 
 * @returns {Promise<{allowed: boolean, limit: number, current: number}>}
 */
async function checkDailyLimit(userId, planType) {
  try {
    const db = getDb();
    
    // Free plan uses total active reminders, not daily count
    if (planType === 'free') {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM reminders WHERE user_id = $1 AND is_done = false',
        [userId]
      );
      const current = parseInt(result.rows[0].count);
      return {
        allowed: current < DAILY_LIMITS.free,
        limit: DAILY_LIMITS.free,
        current
      };
    }
    
    // For paid plans, check daily count
    const userResult = await db.query(
      'SELECT daily_reminder_count, last_count_reset FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return { allowed: false, limit: 0, current: 0 };
    }
    
    const user = userResult.rows[0];
    const lastReset = moment.tz(user.last_count_reset, TIMEZONE);
    const now = moment.tz(TIMEZONE);
    
    // Reset count if it's a new day
    if (!lastReset.isSame(now, 'day')) {
      await db.query(
        'UPDATE users SET daily_reminder_count = 0, last_count_reset = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
      );
      return {
        allowed: true,
        limit: DAILY_LIMITS[planType] || DAILY_LIMITS.personal,
        current: 0
      };
    }
    
    const limit = DAILY_LIMITS[planType] || DAILY_LIMITS.personal;
    const current = user.daily_reminder_count;
    
    return {
      allowed: current < limit,
      limit,
      current
    };
  } catch (error) {
    console.error('[DAILY LIMIT] Error checking daily limit:', error);
    throw error;
  }
}

/**
 * Increment daily reminder count
 * @param {string} userId 
 */
async function incrementDailyCount(userId) {
  try {
    const db = getDb();
    await db.query(
      'UPDATE users SET daily_reminder_count = daily_reminder_count + 1 WHERE id = $1',
      [userId]
    );
  } catch (error) {
    console.error('[DAILY LIMIT] Error incrementing count:', error);
    throw error;
  }
}

/**
 * Update user streak on DONE action
 * @param {string} userId 
 * @returns {Promise<number>} - New streak count
 */
async function updateStreak(userId) {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE users SET streak_count = streak_count + 1 WHERE id = $1 RETURNING streak_count',
      [userId]
    );
    
    return result.rows[0]?.streak_count || 0;
  } catch (error) {
    console.error('[STREAK] Error updating streak:', error);
    throw error;
  }
}

/**
 * Reset user streak (when they don't complete a reminder)
 * @param {string} userId 
 */
async function resetStreak(userId) {
  try {
    const db = getDb();
    await db.query(
      'UPDATE users SET streak_count = 0 WHERE id = $1',
      [userId]
    );
  } catch (error) {
    console.error('[STREAK] Error resetting streak:', error);
    throw error;
  }
}

/**
 * Get streak message for milestones
 * @param {number} streak 
 * @returns {string|null}
 */
function getStreakMessage(streak) {
  if (streak === 3) {
    return "🔥 3 reminder streak! Keep it up!";
  } else if (streak === 5) {
    return "⭐ 5 streak! You're crushing it!";
  } else if (streak === 10) {
    return "🏆 10 streak! You're a ReminderBot champion!";
  } else if (streak % 10 === 0 && streak > 10) {
    return `🏆 ${streak} streak! You're unstoppable!`;
  }
  return null;
}

module.exports = {
  checkDailyLimit,
  incrementDailyCount,
  updateStreak,
  resetStreak,
  getStreakMessage,
  DAILY_LIMITS
};
