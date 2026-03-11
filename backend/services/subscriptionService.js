const { pool } = require('../config/db');
const moment = require('moment-timezone');

/**
 * Update user's plan type
 * @param {number} userId 
 * @param {string} planType 
 * @returns {Promise<Object>}
 */
async function updateUserPlan(userId, planType) {
  try {
    const result = await pool.query(
      'UPDATE users SET plan_type = $1 WHERE id = $2 RETURNING *',
      [planType, userId]
    );
    console.log(`[SUBSCRIPTION] ✓ Updated user ${userId} to plan: ${planType}`);
    return result.rows[0];
  } catch (error) {
    console.error('[SUBSCRIPTION] Error updating user plan:', error);
    throw error;
  }
}

/**
 * Create or update subscription record
 * @param {number} userId 
 * @param {string} plan 
 * @param {string} status 
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Object>}
 */
async function createSubscription(userId, plan, status, paymentId = null) {
  try {
    const startedAt = new Date();
    const expiresAt = moment().add(30, 'days').toDate();
    
    // Check if subscription exists
    const existing = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 1',
      [userId]
    );
    
    if (existing.rows.length > 0) {
      // Update existing subscription
      const result = await pool.query(
        `UPDATE subscriptions 
         SET plan = $1, status = $2, started_at = $3, expires_at = $4 
         WHERE user_id = $5 
         RETURNING *`,
        [plan, status, startedAt, expiresAt, userId]
      );
      console.log(`[SUBSCRIPTION] ✓ Updated subscription for user ${userId}`);
      return result.rows[0];
    } else {
      // Create new subscription
      const result = await pool.query(
        `INSERT INTO subscriptions (user_id, plan, status, started_at, expires_at) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [userId, plan, status, startedAt, expiresAt]
      );
      console.log(`[SUBSCRIPTION] ✓ Created subscription for user ${userId}`);
      return result.rows[0];
    }
  } catch (error) {
    console.error('[SUBSCRIPTION] Error creating/updating subscription:', error);
    throw error;
  }
}

/**
 * Get active subscription for user
 * @param {number} userId 
 * @returns {Promise<Object|null>}
 */
async function getActiveSubscription(userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM subscriptions 
       WHERE user_id = $1 AND status = 'active' 
       ORDER BY started_at DESC 
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('[SUBSCRIPTION] Error getting active subscription:', error);
    throw error;
  }
}

module.exports = {
  updateUserPlan,
  createSubscription,
  getActiveSubscription,
};
