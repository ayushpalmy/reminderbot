const { getDb } = require('../config/db');
const moment = require('moment-timezone');

/**
 * Update user's plan type
 * @param {string} userId 
 * @param {string} planType 
 * @returns {Promise<Object>}
 */
async function updateUserPlan(userId, planType) {
  try {
    const db = getDb();
    const result = await db.query(
      'UPDATE users SET plan_type = $1 WHERE id = $2 RETURNING *',
      [planType, userId]
    );
    
    console.log(`[SUBSCRIPTION] ✓ Updated user ${userId} to plan: ${planType}`);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[SUBSCRIPTION] Error updating user plan:', error);
    throw error;
  }
}

/**
 * Create or update subscription record
 * @param {string} userId 
 * @param {string} plan 
 * @param {string} status 
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Object>}
 */
async function createSubscription(userId, plan, status, paymentId = null) {
  try {
    const db = getDb();
    const startedAt = new Date();
    const expiresAt = moment().add(30, 'days').toDate();
    
    // Check if subscription exists
    const existingResult = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 1',
      [userId]
    );
    
    if (existingResult.rows.length > 0) {
      // Update existing subscription
      const result = await db.query(
        `UPDATE subscriptions 
         SET plan = $1, status = $2, started_at = $3, expires_at = $4, payment_id = $5
         WHERE id = $6
         RETURNING *`,
        [plan, status, startedAt, expiresAt, paymentId, existingResult.rows[0].id]
      );
      console.log(`[SUBSCRIPTION] ✓ Updated subscription for user ${userId}`);
      return result.rows[0];
    } else {
      // Create new subscription
      const result = await db.query(
        `INSERT INTO subscriptions (user_id, plan, status, started_at, expires_at, payment_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, plan, status, startedAt, expiresAt, paymentId]
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
 * @param {string} userId 
 * @returns {Promise<Object|null>}
 */
async function getActiveSubscription(userId) {
  try {
    const db = getDb();
    const result = await db.query(
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
