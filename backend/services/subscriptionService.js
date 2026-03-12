const { getDb, ObjectId } = require('../config/db');
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
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { plan_type: planType } }
    );
    
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    console.log(`[SUBSCRIPTION] ✓ Updated user ${userId} to plan: ${planType}`);
    
    return user ? { ...user, id: user._id.toString() } : null;
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
    const existing = await db.collection('subscriptions')
      .findOne({ user_id: userId }, { sort: { started_at: -1 } });
    
    if (existing) {
      // Update existing subscription
      await db.collection('subscriptions').updateOne(
        { _id: existing._id },
        {
          $set: {
            plan: plan,
            status: status,
            started_at: startedAt,
            expires_at: expiresAt,
            payment_id: paymentId
          }
        }
      );
      console.log(`[SUBSCRIPTION] ✓ Updated subscription for user ${userId}`);
      
      const updated = await db.collection('subscriptions').findOne({ _id: existing._id });
      return { ...updated, id: updated._id.toString() };
    } else {
      // Create new subscription
      const subscription = {
        user_id: userId,
        plan: plan,
        status: status,
        started_at: startedAt,
        expires_at: expiresAt,
        payment_id: paymentId
      };
      
      const result = await db.collection('subscriptions').insertOne(subscription);
      console.log(`[SUBSCRIPTION] ✓ Created subscription for user ${userId}`);
      
      return { ...subscription, id: result.insertedId.toString() };
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
    const subscription = await db.collection('subscriptions')
      .findOne(
        { user_id: userId, status: 'active' },
        { sort: { started_at: -1 } }
      );
    
    return subscription ? { ...subscription, id: subscription._id.toString() } : null;
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
