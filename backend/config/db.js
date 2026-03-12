const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection URL
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'reminder_bot';

let db = null;
let client = null;

/**
 * Initialize MongoDB connection
 */
async function initDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    
    client = new MongoClient(MONGO_URL);
    await client.connect();
    
    db = client.db(DB_NAME);
    
    // Create indexes for better performance
    console.log('Creating indexes...');
    
    // Users collection indexes
    await db.collection('users').createIndex({ phone_number: 1 }, { unique: true, sparse: true });
    await db.collection('users').createIndex({ telegram_chat_id: 1 }, { unique: true, sparse: true });
    console.log('✓ Users indexes created');
    
    // Reminders collection indexes
    await db.collection('reminders').createIndex({ user_id: 1 });
    await db.collection('reminders').createIndex({ remind_at: 1 });
    await db.collection('reminders').createIndex({ is_done: 1, remind_at: 1 });
    console.log('✓ Reminders indexes created');
    
    // Subscriptions collection indexes
    await db.collection('subscriptions').createIndex({ user_id: 1 });
    console.log('✓ Subscriptions indexes created');
    
    console.log('Database connection established');
    console.log(`Database: ${DB_NAME}\n`);
    
    return db;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

/**
 * Get the database instance
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
async function closeDatabase() {
  if (client) {
    await client.close();
    console.log('Database connection closed');
  }
}

module.exports = {
  initDatabase,
  getDb,
  closeDatabase,
  ObjectId
};
