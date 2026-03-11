const { pool } = require('../config/db');

/**
 * Get user by phone number
 * @param {string} phoneNumber 
 * @returns {Promise<Object|null>}
 */
async function getUserByPhone(phoneNumber) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE phone_number = $1',
      [phoneNumber]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by phone:', error);
    throw error;
  }
}

/**
 * Create a new user
 * @param {string} phoneNumber 
 * @param {string} planType 
 * @returns {Promise<Object>}
 */
async function createUser(phoneNumber, planType = 'free') {
  try {
    const result = await pool.query(
      'INSERT INTO users (phone_number, plan_type) VALUES ($1, $2) RETURNING *',
      [phoneNumber, planType]
    );
    console.log(`✓ Created new user: ${phoneNumber} with plan: ${planType}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Get or create user
 * @param {string} phoneNumber 
 * @returns {Promise<Object>}
 */
async function getOrCreateUser(phoneNumber) {
  let user = await getUserByPhone(phoneNumber);
  if (!user) {
    user = await createUser(phoneNumber);
  }
  return user;
}

module.exports = {
  getUserByPhone,
  createUser,
  getOrCreateUser
};