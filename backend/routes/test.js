const express = require('express');
const router = express.Router();
const { getOrCreateUser } = require('../services/userService');
const { createReminder, getUserReminders } = require('../services/reminderService');
const moment = require('moment-timezone');

/**
 * Test endpoint to create a reminder directly (bypassing OpenAI)
 * POST /api/test/reminder
 */
router.post('/reminder', async (req, res) => {
  try {
    const { phone_number, reminder_text, date_string, repeat_type } = req.body;
    
    if (!phone_number || !reminder_text || !date_string) {
      return res.status(400).json({ 
        error: 'Missing required fields: phone_number, reminder_text, date_string' 
      });
    }
    
    // Get or create user
    const user = await getOrCreateUser(phone_number);
    
    // Parse date
    const remindAt = moment.tz(date_string, 'Asia/Kolkata').toDate();
    
    // Create reminder
    const reminder = await createReminder(
      user.id,
      reminder_text,
      remindAt,
      repeat_type || 'once'
    );
    
    res.json({
      success: true,
      user: {
        id: user.id,
        phone_number: user.phone_number,
        plan_type: user.plan_type
      },
      reminder: {
        id: reminder.id,
        reminder_text: reminder.reminder_text,
        remind_at: reminder.remind_at,
        repeat_type: reminder.repeat_type
      }
    });
    
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all reminders for a user
 * GET /api/test/reminders/:phone_number
 */
router.get('/reminders/:phone_number', async (req, res) => {
  try {
    const { phone_number } = req.params;
    
    const user = await getOrCreateUser(phone_number);
    const reminders = await getUserReminders(user.id);
    
    res.json({
      user: {
        id: user.id,
        phone_number: user.phone_number,
        plan_type: user.plan_type
      },
      reminders: reminders
    });
    
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
