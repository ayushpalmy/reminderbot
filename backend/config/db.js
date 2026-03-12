const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Initialize PostgreSQL database and create tables
 */
async function initDatabase() {
  try {
    console.log('Connecting to PostgreSQL...');
    
    // Test connection
    const client = await pool.connect();
    console.log('✓ PostgreSQL connection established');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_number VARCHAR(50) UNIQUE,
        telegram_chat_id VARCHAR(100) UNIQUE,
        plan_type VARCHAR(20) DEFAULT 'free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Users table ready');
    
    // Create reminders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reminder_text TEXT NOT NULL,
        remind_at TIMESTAMP NOT NULL,
        repeat_type VARCHAR(20) DEFAULT 'once',
        is_done BOOLEAN DEFAULT false,
        last_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Reminders table ready');
    
    // Create subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        started_at TIMESTAMP NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        payment_id VARCHAR(100)
      )
    `);
    console.log('✓ Subscriptions table ready');
    
    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
      CREATE INDEX IF NOT EXISTS idx_reminders_is_done_remind_at ON reminders(is_done, remind_at);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
    `);
    console.log('✓ Indexes created');
    
    client.release();
    console.log('Database initialization complete\n');
    
    return pool;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

/**
 * Get the database pool
 */
function getDb() {
  return pool;
}

/**
 * Close database connection
 */
async function closeDatabase() {
  await pool.end();
  console.log('Database connection closed');
}

/**
 * Generate a new UUID
 */
function generateUUID() {
  return uuidv4();
}

module.exports = {
  initDatabase,
  getDb,
  closeDatabase,
  generateUUID
};
