const express = require('express');
const router = express.Router();
const { getDashboardStats, getRecentUsers } = require('../services/adminService');
const moment = require('moment-timezone');

// Simple auth middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
    return res.status(401).send('Authentication required');
  }
  
  // Parse Basic Auth header
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const username = auth[0];
  const password = auth[1];
  
  // Check password (username is ignored)
  if (password !== adminPassword) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"');
    return res.status(401).send('Invalid password');
  }
  
  next();
}

/**
 * GET /admin
 * Admin dashboard page
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    // Fetch stats and recent users
    const stats = await getDashboardStats();
    const recentUsers = await getRecentUsers(10);
    
    // Generate HTML
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard - ReminderBot</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      border-bottom: 3px solid #4CAF50;
      padding-bottom: 10px;
      margin-bottom: 30px;
    }
    h2 {
      color: #555;
      margin-top: 30px;
      margin-bottom: 15px;
      font-size: 20px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-card:nth-child(2) {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    }
    .stat-card:nth-child(3) {
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    }
    .stat-card:nth-child(4) {
      background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
    }
    .stat-card:nth-child(5) {
      background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    }
    .stat-value {
      font-size: 36px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .stat-label {
      font-size: 14px;
      opacity: 0.9;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background: #4CAF50;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #ddd;
    }
    tr:hover {
      background: #f5f5f5;
    }
    .plan-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .plan-free {
      background: #e3f2fd;
      color: #1976d2;
    }
    .plan-personal {
      background: #fce4ec;
      color: #c2185b;
    }
    .refresh-info {
      text-align: center;
      margin-top: 30px;
      color: #888;
      font-size: 14px;
    }
    .timestamp {
      text-align: right;
      color: #888;
      font-size: 14px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 ReminderBot Admin Dashboard</h1>
    <div class="timestamp">Last updated: ${moment().format('DD MMM YYYY, h:mm:ss A')}</div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalUsers}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.freePlanUsers}</div>
        <div class="stat-label">Free Plan Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.paidPlanUsers}</div>
        <div class="stat-label">Paid Plan Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.activeReminders}</div>
        <div class="stat-label">Active Reminders</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.remindersSentToday}</div>
        <div class="stat-label">Reminders Sent Today</div>
      </div>
    </div>

    <h2>👥 Recent Users (Last 10)</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Contact</th>
          <th>Platform</th>
          <th>Plan Type</th>
          <th>Joined Date</th>
        </tr>
      </thead>
      <tbody>
        ${recentUsers.map(user => `
          <tr>
            <td>${user.id}</td>
            <td>${user.phone_number || user.telegram_chat_id || '-'}</td>
            <td>${user.telegram_chat_id ? '📱 Telegram' : '💬 WhatsApp'}</td>
            <td>
              <span class="plan-badge plan-${user.plan_type}">
                ${user.plan_type.toUpperCase()}
              </span>
            </td>
            <td>${moment(user.created_at).format('DD MMM YYYY, h:mm A')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="refresh-info">
      Refresh the page to update stats
    </div>
  </div>
</body>
</html>
    `;
    
    res.send(html);
    
  } catch (error) {
    console.error('[ADMIN] Error rendering dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

module.exports = router;
