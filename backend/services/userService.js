const { getDb, ObjectId } = require('../config/db');

/**
 * Get user by phone number
 * @param {string} phoneNumber 
 * @returns {Promise<Object|null>}
 */
async function getUserByPhone(phoneNumber) {
  try {
    const db = getDb();
    const user = await db.collection('users').findOne({ phone_number: phoneNumber });
    return user ? { ...user, id: user._id.toString() } : null;
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
    const user = await db.collection('users').findOne({ telegram_chat_id: telegramChatId });
    return user ? { ...user, id: user._id.toString() } : null;
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
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    return user ? { ...user, id: user._id.toString() } : null;
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
    const result = await db.collection('users').insertOne({
      phone_number: phoneNumber,
      telegram_chat_id: null,
      plan_type: planType,
      created_at: new Date()
    });
    
    console.log(`✓ Created new user: ${phoneNumber} with plan: ${planType}`);
    
    return {
      id: result.insertedId.toString(),
      phone_number: phoneNumber,
      telegram_chat_id: null,
      plan_type: planType,
      created_at: new Date()
    };
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
    const result = await db.collection('users').insertOne({
      phone_number: null,
      telegram_chat_id: telegramChatId,
      plan_type: planType,
      created_at: new Date()
    });
    
    console.log(`✓ Created new Telegram user: ${telegramChatId} with plan: ${planType}`);
    
    return {
      id: result.insertedId.toString(),
      phone_number: null,
      telegram_chat_id: telegramChatId,
      plan_type: planType,
      created_at: new Date()
    };
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
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { plan_type: planType } }
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
