const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { initDatabase } = require('./config/db');
const { initializeScheduler } = require('./services/reminderScheduler');
const webhookRoutes = require('./routes/webhook');
const testRoutes = require('./routes/test');
const razorpayWebhookRoutes = require('./routes/razorpayWebhook');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 8001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS || '*',
  credentials: true
}));

// Logging middleware (before raw body routes)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Special handling for Razorpay webhook (needs raw body) - BEFORE bodyParser
app.use('/api/razorpay', razorpayWebhookRoutes);

// Body parsers (after Razorpay webhook route)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/webhook', webhookRoutes);
app.use('/api/test', testRoutes);

// Root endpoint
app.get('/api', (req, res) => {
  res.json({ 
    message: 'WhatsApp Reminder Bot API',
    status: 'running',
    endpoints: {
      webhook_verify: 'GET /api/webhook',
      webhook_receive: 'POST /api/webhook'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Initialize database and start server
initDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n========================================`);
      console.log(`WhatsApp Reminder Bot Backend Started`);
      console.log(`========================================`);
      console.log(`Server running on: 0.0.0.0:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Database: Connected`);
      console.log(`========================================\n`);
      
      // Initialize reminder scheduler after server starts
      initializeScheduler();
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });