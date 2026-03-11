const axios = require('axios');

let keepaliveInterval = null;

/**
 * Initialize keepalive mechanism
 * Pings the app's own /health endpoint every 10 minutes
 * to prevent Render free tier from sleeping
 */
function initializeKeepalive() {
  const appUrl = process.env.APP_URL;
  
  if (!appUrl) {
    console.log('[KEEPALIVE] APP_URL not set, keepalive disabled');
    return;
  }
  
  console.log('[KEEPALIVE] Initializing keepalive mechanism');
  console.log('[KEEPALIVE] Target URL:', appUrl);
  console.log('[KEEPALIVE] Interval: Every 10 minutes');
  
  // Ping immediately on startup (after 30 seconds)
  setTimeout(() => {
    pingHealth();
  }, 30000);
  
  // Then ping every 10 minutes (600000 ms)
  keepaliveInterval = setInterval(() => {
    pingHealth();
  }, 600000); // 10 minutes
  
  console.log('[KEEPALIVE] ✓ Keepalive initialized successfully\n');
}

/**
 * Ping the health endpoint
 */
async function pingHealth() {
  const appUrl = process.env.APP_URL;
  const healthUrl = `${appUrl}/health`;
  
  try {
    const startTime = Date.now();
    const response = await axios.get(healthUrl, {
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'ReminderBot-Keepalive/1.0'
      }
    });
    
    const duration = Date.now() - startTime;
    
    if (response.status === 200) {
      console.log(`[KEEPALIVE] ✓ Ping successful (${duration}ms) - Server is awake`);
    } else {
      console.log(`[KEEPALIVE] ⚠️ Unexpected status: ${response.status}`);
    }
  } catch (error) {
    console.error('[KEEPALIVE] ✗ Ping failed:', error.message);
    // Don't throw - just log and continue
  }
}

/**
 * Stop keepalive (for graceful shutdown)
 */
function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    console.log('[KEEPALIVE] Keepalive stopped');
  }
}

module.exports = {
  initializeKeepalive,
  stopKeepalive
};
