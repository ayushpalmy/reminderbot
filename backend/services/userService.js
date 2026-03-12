const { getDb } = require('../config/db');

/**
 * Get user by phone number
 * @param {string} phoneNumber 
 * @returns {Promise<Object|null>}
 */
async function getUserByPhone(phoneNumber) {
  try {
    const db = getDb();
    const result = await db.query(
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
 * Get user by Telegram chat ID
 * @param {string} telegramChatId 
 * @returns {Promise<Object|null>}
 */
async function getUserByTelegramChatId(telegramChatId) {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT * FROM users WHERE telegram_chat_id = $1',
      [telegramChatId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by Telegram chat ID:', error);
    throw error;
  }
}

/**
 * Get user by ID
 * @param {string} userId 
 * @returns {Promise<Object|null>}
 */
async function getUserById(userId) {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
}

/**
 * Create a new user (WhatsApp)
 * @param {string} phoneNumber 
 * @param {string} planType 
 * @returns {Promise<Object>}
 */
async function createUser(phoneNumber, planType = 'free') {
  try {
    const db = getDb();
    const result = await db.query(
      `INSERT INTO users (phone_number, plan_type) 
       VALUES ($1, $2) 
       RETURNING *`,
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
 * Create a new Telegram user
 * @param {string} telegramChatId 
 * @param {string} planType 
 * @returns {Promise<Object>}
 */
async function createTelegramUser(telegramChatId, planType = 'free') {
  try {
    const db = getDb();
    const result = await db.query(
      `INSERT INTO users (telegram_chat_id, plan_type) 
       VALUES ($1, $2) 
       RETURNING *`,
      [telegramChatId, planType]
    );
    
    console.log(`✓ Created new Telegram user: ${telegramChatId} with plan: ${planType}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating Telegram user:', error);
    throw error;
  }
}

/**
 * Get or create user (WhatsApp)
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

/**
 * Get or create Telegram user
 * @param {string} telegramChatId 
 * @returns {Promise<Object>}
 */
async function getOrCreateTelegramUser(telegramChatId) {
  let user = await getUserByTelegramChatId(telegramChatId);
  if (!user) {
    user = await createTelegramUser(telegramChatId);
  }
  return user;
}

/**
 * Update user plan
 * @param {string} userId 
 * @param {string} planType 
 * @returns {Promise<Object>}
 */
async function updateUserPlan(userId, planType) {
  try {
    const db = getDb();
    await db.query(
      'UPDATE users SET plan_type = $1 WHERE id = $2',
      [planType, userId]
    );
    
    return getUserById(userId);
  } catch (error) {
    console.error('Error updating user plan:', error);
    throw error;
  }
}

module.exports = {
  getUserByPhone,
  getUserByTelegramChatId,
  getUserById,
  createUser,
  createTelegramUser,
  getOrCreateUser,
  getOrCreateTelegramUser,
  updateUserPlan
};
