const express = require('express');
const router = express.Router();
const { getOrCreateTelegramUser, getUserByTelegramChatId } = require('../services/userService');
const { createReminder, getActiveReminderCount } = require('../services/reminderService');
const { parseReminderMessage } = require('../services/reminderParser');
const { 
  sendTelegramMessage,
  sendTelegramReminderConfirmation,
  sendTelegramParseErrorMessage
} = require('../services/telegramService');
const { markReminderDone, snoozeReminder } = require('../services/reminderScheduler');
const { createPaymentLink } = require('../services/razorpayService');
const { 
  setUserState, 
  getUserState, 
  clearUserState,
  getMostRecentReminder,
  getActiveRemindersFormatted,
  deleteReminder,
  updateReminderTime
} = require('../services/conversationService');
const moment = require('moment-timezone');

// Reminder templates with detailed flows
const REMINDER_TEMPLATES = {
  1: { text: 'Medicine', emoji: '💊', type: 'medicine' },
  2: { text: 'Electricity bill', emoji: '💡', type: 'bill' },
  3: { text: 'Rent', emoji: '🏠', type: 'rent' },
  4: { text: 'Credit card bill', emoji: '💳', type: 'creditcard' },
  5: { text: 'Gym', emoji: '🏋️', type: 'gym' },
  6: { text: 'Study', emoji: '📚', type: 'study' }
};

/**
 * Show the main menu
 */
async function showMainMenu(chatId) {
  const helpMessage = `🤖 ReminderBot — What would you like to do?

Common reminders:
1. 💊 Medicine reminder
2. 💡 Electricity bill
3. 🏠 Rent payment
4. 💳 Credit card bill
5. 🏋️ Gym reminder
6. 📚 Study reminder
7. ✍️ Create my own reminder

Just type a number to pick, or type anything naturally to set a custom reminder!`;
  
  await sendTelegramMessage(chatId, helpMessage);
  setUserState(chatId, 'waiting_menu_selection', {});
}

/**
 * POST /api/telegram/webhook
 * Receive messages from Telegram
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('\n[TELEGRAM WEBHOOK] Received update');
    
    const update = req.body;
    
    // Handle text messages
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id.toString();
      const messageText = update.message.text.trim();
      const messageUpper = messageText.toUpperCase();
      
      console.log(`[TELEGRAM] Chat ID: ${chatId}`);
      console.log(`[TELEGRAM] Message: ${messageText}`);
      
      // Check if this is a brand new user
      const existingUser = await getUserByTelegramChatId(chatId);
      const isNewUser = !existingUser;
      
      // Get or create user
      const user = await getOrCreateTelegramUser(chatId);
      
      // Get current conversation state
      const userState = getUserState(chatId);
      
      // Handle /start for new users
      if (messageUpper === '/START' && isNewUser) {
        console.log('[TELEGRAM] New user - showing welcome message');
        await sendTelegramMessage(
          chatId,
          "👋 Welcome to ReminderBot!\nI help you never forget bills, medicines, and important tasks.\n\nType Hi or Hello to get started!"
        );
        return res.status(200).json({ ok: true });
      }
      
      // Handle greetings (hi, hello, hey, etc.)
      if (['HI', 'HELLO', 'HEY', 'HII', 'HELO', 'HEYY', 'HEYA'].includes(messageUpper) || messageUpper === '/START') {
        console.log('[TELEGRAM] Greeting detected - showing menu');
        await showMainMenu(chatId);
        return res.status(200).json({ ok: true });
      }
      
      // Handle HELP
      if (messageUpper === 'HELP' || messageUpper === '/HELP') {
        console.log('[TELEGRAM] HELP command');
        await showMainMenu(chatId);
        return res.status(200).json({ ok: true });
      }
      
      // Handle MY REMINDERS
      if (messageUpper === 'MY REMINDERS') {
        console.log('[TELEGRAM] Command: MY REMINDERS');
        
        try {
          const reminders = await getActiveRemindersFormatted(user.id);
          
          if (reminders.length === 0) {
            await sendTelegramMessage(chatId, "You don't have any active reminders.");
          } else {
            const reminderList = reminders.map(r => r.displayText).join('\n\n');
            const message = `📝 Your Active Reminders:\n\n${reminderList}\n\nTo delete: Send DELETE [number]`;
            await sendTelegramMessage(chatId, message);
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, there was an error.");
        }
        
        return res.status(200).json({ ok: true });
      }
      
      // Handle UPGRADE
      if (messageUpper === 'UPGRADE') {
        console.log('[TELEGRAM] Command: UPGRADE');
        
        try {
          if (user.plan_type !== 'free') {
            await sendTelegramMessage(chatId, `You're already on the ${user.plan_type} plan! 🎉`);
          } else {
            const paymentLink = await createPaymentLink(chatId, user.id);
            const message = `💳 Upgrade to Personal Plan\n\n✨ Unlimited reminders\n💰 ₹49/month\n\nPay here: ${paymentLink.short_url}`;
            await sendTelegramMessage(chatId, message);
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, there was an error generating the payment link.");
        }
        
        return res.status(200).json({ ok: true });
      }
      
      // Handle DELETE command
      if (messageUpper.startsWith('DELETE ')) {
        console.log('[TELEGRAM] Command: DELETE');
        
        try {
          const numberMatch = messageText.match(/DELETE\s+(\d+)/i);
          
          if (!numberMatch) {
            await sendTelegramMessage(chatId, "Please specify a reminder number. Example: DELETE 2");
          } else {
            const reminderNumber = parseInt(numberMatch[1]);
            const reminders = await getActiveRemindersFormatted(user.id);
            
            if (reminderNumber < 1 || reminderNumber > reminders.length) {
              await sendTelegramMessage(chatId, `Invalid reminder number. You have ${reminders.length} active reminder(s).`);
            } else {
              const reminderToDelete = reminders[reminderNumber - 1];
              const deleted = await deleteReminder(reminderToDelete.id, user.id);
              
              if (deleted) {
                await sendTelegramMessage(chatId, "🗑️ Reminder deleted");
              } else {
                await sendTelegramMessage(chatId, "Could not delete reminder. Please try again.");
              }
            }
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, there was an error.");
        }
        
        return res.status(200).json({ ok: true });
      }
      
      // STATE: waiting_reminder_action (after reminder notification)
      // Handle DONE/SNOOZE/RESCHEDULE (both numbers and text)
      if (userState && userState.state === 'waiting_reminder_action') {
        console.log('[TELEGRAM] Processing reminder action');
        
        if (messageText === '1' || messageUpper === 'DONE') {
          try {
            const recentReminder = await getMostRecentReminder(user.id);
            
            if (!recentReminder) {
              await sendTelegramMessage(chatId, "You don't have any active reminders.");
            } else {
              await markReminderDone(recentReminder.id);
              await sendTelegramMessage(chatId, "✅ Marked as done!");
            }
            clearUserState(chatId);
          } catch (error) {
            console.error('[TELEGRAM ERROR]:', error);
            await sendTelegramMessage(chatId, "Sorry, there was an error.");
          }
          
        } else if (messageText === '2' || messageUpper === 'SNOOZE') {
          try {
            const recentReminder = await getMostRecentReminder(user.id);
            
            if (!recentReminder) {
              await sendTelegramMessage(chatId, "You don't have any active reminders.");
            } else {
              await snoozeReminder(recentReminder.id);
              await sendTelegramMessage(chatId, "⏰ Snoozed for 2 hours!");
            }
            clearUserState(chatId);
          } catch (error) {
            console.error('[TELEGRAM ERROR]:', error);
            await sendTelegramMessage(chatId, "Sorry, there was an error.");
          }
          
        } else if (messageText === '3' || messageUpper === 'RESCHEDULE') {
          try {
            const recentReminder = await getMostRecentReminder(user.id);
            
            if (!recentReminder) {
              await sendTelegramMessage(chatId, "You don't have any active reminders.");
            } else {
              setUserState(chatId, 'waiting_reschedule', { reminderId: recentReminder.id });
              await sendTelegramMessage(
                chatId, 
                "When should I remind you?\nExample: tomorrow 9PM or 25th March 6PM"
              );
            }
          } catch (error) {
            console.error('[TELEGRAM ERROR]:', error);
            await sendTelegramMessage(chatId, "Sorry, there was an error.");
          }
        } else {
          await sendTelegramMessage(chatId, "Please reply with:\n1 or DONE — mark complete\n2 or SNOOZE — remind in 2 hours\n3 or RESCHEDULE — set new time");
        }
        
        return res.status(200).json({ ok: true });
      }
      
      // STATE: waiting_menu_selection (after showing HELP menu)
      // Handle menu selection (1-7)
      if (userState && userState.state === 'waiting_menu_selection') {
        if (messageText >= '1' && messageText <= '7' && messageText.length === 1) {
          const templateNum = parseInt(messageText);
          
          // Check free plan limit first
          if (user.plan_type === 'free') {
            const activeCount = await getActiveReminderCount(user.id);
            
            if (activeCount >= 3) {
              await sendTelegramMessage(
                chatId,
                "⚠️ You've used all 3 free reminders.\nReply UPGRADE to get unlimited reminders for ₹49/month"
              );
              clearUserState(chatId);
              return res.status(200).json({ ok: true });
            }
          }
          
          if (templateNum === 7) {
            // Custom reminder
            console.log('[TELEGRAM] User selected custom reminder (7)');
            setUserState(chatId, 'waiting_custom_reminder', {});
            await sendTelegramMessage(chatId, "What would you like to be reminded about? Type naturally.");
            
          } else if (REMINDER_TEMPLATES[templateNum]) {
            // Template reminder (1-6)
            console.log(`[TELEGRAM] User selected template ${templateNum}`);
            const template = REMINDER_TEMPLATES[templateNum];
            
            // Start template flow based on type
            if (template.type === 'medicine') {
              setUserState(chatId, 'template_medicine_name', { templateNum });
              await sendTelegramMessage(chatId, `${template.emoji} Medicine reminder — What medicine should I remind you about?`);
              
            } else if (template.type === 'bill' || template.type === 'creditcard') {
              setUserState(chatId, 'template_bill_date', { templateNum, text: template.text });
              await sendTelegramMessage(chatId, `${template.emoji} ${template.text} — Which date every month should I remind you?\nExample: 5th or 15th`);
              
            } else if (template.type === 'rent') {
              setUserState(chatId, 'template_rent_date', { templateNum });
              await sendTelegramMessage(chatId, `${template.emoji} Rent payment — Which date every month should I remind you?\nExample: 1st or 5th`);
              
            } else if (template.type === 'gym' || template.type === 'study') {
              setUserState(chatId, 'template_activity_frequency', { templateNum, text: template.text, emoji: template.emoji });
              await sendTelegramMessage(chatId, `${template.emoji} ${template.text} reminder — How often?\n\nReply:\nDaily\nWeekly\nOne time`);
            }
          }
          
          return res.status(200).json({ ok: true });
        } else {
          // User typed something other than 1-7, parse as natural language
          clearUserState(chatId);
          // Fall through to natural language parsing
        }
      }
      
      // STATE: Multi-step template flows
      
      // Medicine flow: Step 1 - got medicine name, ask frequency
      if (userState && userState.state === 'template_medicine_name') {
        setUserState(chatId, 'template_medicine_frequency', { medicineName: messageText });
        await sendTelegramMessage(chatId, "Got it! How often?\n\nReply:\nDaily\nWeekly\nOne time");
        return res.status(200).json({ ok: true });
      }
      
      // Medicine flow: Step 2 - got frequency, ask time
      if (userState && userState.state === 'template_medicine_frequency') {
        const frequency = messageUpper;
        let repeatType = 'once';
        
        if (frequency.includes('DAILY') || frequency.includes('DAY')) {
          repeatType = 'daily';
        } else if (frequency.includes('WEEKLY') || frequency.includes('WEEK')) {
          repeatType = 'weekly';
        }
        
        setUserState(chatId, 'template_medicine_time', { 
          medicineName: userState.data.medicineName,
          repeatType
        });
        await sendTelegramMessage(chatId, "At what time?\nExample: 9AM or 8:30PM");
        return res.status(200).json({ ok: true });
      }
      
      // Medicine flow: Step 3 - got time, create reminder
      if (userState && userState.state === 'template_medicine_time') {
        try {
          const medicineName = userState.data.medicineName;
          const repeatType = userState.data.repeatType;
          const parsedTime = await parseReminderMessage(`remind me to take ${medicineName} ${repeatType === 'once' ? 'tomorrow' : 'every day'} at ${messageText}`);
          
          if (parsedTime && parsedTime.remind_at) {
            const reminderText = `Take ${medicineName}`;
            const reminder = await createReminder(
              user.id,
              reminderText,
              parsedTime.remind_at,
              repeatType
            );
            
            const repeatInfo = repeatType === 'daily' ? ' every day' : repeatType === 'weekly' ? ' every week' : '';
            await sendTelegramMessage(chatId, `✅ Reminder set — ${reminderText}${repeatInfo} at ${parsedTime.formatted_time}`);
            clearUserState(chatId);
          } else {
            await sendTelegramMessage(chatId, "I couldn't understand that time. Please try again with a format like: 9AM or 3:30PM");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, I couldn't process that time.");
          clearUserState(chatId);
        }
        return res.status(200).json({ ok: true });
      }
      
      // Bill/Rent flow: Step 1 - got date, ask time
      if (userState && (userState.state === 'template_bill_date' || userState.state === 'template_rent_date')) {
        const date = messageText.replace(/[^0-9]/g, ''); // Extract number
        const billText = userState.data.text || 'Pay rent';
        
        if (!date || parseInt(date) < 1 || parseInt(date) > 31) {
          await sendTelegramMessage(chatId, "Please enter a valid date (1-31). Example: 5th or 15th");
          return res.status(200).json({ ok: true });
        }
        
        setUserState(chatId, 'template_bill_time', { date, billText });
        await sendTelegramMessage(chatId, "At what time?\nExample: 9AM or 10AM");
        return res.status(200).json({ ok: true });
      }
      
      // Bill/Rent flow: Step 2 - got time, create reminder
      if (userState && userState.state === 'template_bill_time') {
        try {
          const date = userState.data.date;
          const billText = userState.data.billText;
          const parsedTime = await parseReminderMessage(`remind me to ${billText} on ${date}th of every month at ${messageText}`);
          
          if (parsedTime && parsedTime.remind_at) {
            const reminder = await createReminder(
              user.id,
              billText,
              parsedTime.remind_at,
              'monthly'
            );
            
            await sendTelegramMessage(chatId, `✅ Reminder set — ${billText} on ${date}th every month at ${parsedTime.formatted_time}`);
            clearUserState(chatId);
          } else {
            await sendTelegramMessage(chatId, "I couldn't understand that time. Please try again with a format like: 9AM or 10AM");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, I couldn't process that.");
          clearUserState(chatId);
        }
        return res.status(200).json({ ok: true });
      }
      
      // Gym/Study flow: Step 1 - got frequency, ask time
      if (userState && userState.state === 'template_activity_frequency') {
        const frequency = messageUpper;
        let repeatType = 'once';
        
        if (frequency.includes('DAILY') || frequency.includes('DAY')) {
          repeatType = 'daily';
        } else if (frequency.includes('WEEKLY') || frequency.includes('WEEK')) {
          repeatType = 'weekly';
        }
        
        setUserState(chatId, 'template_activity_time', { 
          text: userState.data.text,
          emoji: userState.data.emoji,
          repeatType
        });
        await sendTelegramMessage(chatId, "At what time?\nExample: 6PM or 7:30AM");
        return res.status(200).json({ ok: true });
      }
      
      // Gym/Study flow: Step 2 - got time, create reminder
      if (userState && userState.state === 'template_activity_time') {
        try {
          const activityText = userState.data.text;
          const repeatType = userState.data.repeatType;
          const parsedTime = await parseReminderMessage(`remind me to ${activityText} ${repeatType === 'once' ? 'tomorrow' : 'every day'} at ${messageText}`);
          
          if (parsedTime && parsedTime.remind_at) {
            const reminder = await createReminder(
              user.id,
              activityText,
              parsedTime.remind_at,
              repeatType
            );
            
            const repeatInfo = repeatType === 'daily' ? ' every day' : repeatType === 'weekly' ? ' every week' : '';
            await sendTelegramMessage(chatId, `✅ Reminder set — ${activityText}${repeatInfo} at ${parsedTime.formatted_time}`);
            clearUserState(chatId);
          } else {
            await sendTelegramMessage(chatId, "I couldn't understand that time. Please try again with a format like: 6PM or 7:30AM");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, I couldn't process that time.");
          clearUserState(chatId);
        }
        return res.status(200).json({ ok: true });
      }
      
      // STATE: waiting_custom_reminder
      if (userState && userState.state === 'waiting_custom_reminder') {
        console.log('[TELEGRAM] Processing custom reminder');
        
        try {
          const parsedReminder = await parseReminderMessage(messageText);
          
          if (parsedReminder) {
            const reminder = await createReminder(
              user.id,
              parsedReminder.reminder_text,
              parsedReminder.remind_at,
              parsedReminder.repeat_type
            );
            
            await sendTelegramReminderConfirmation(
              chatId,
              parsedReminder.reminder_text,
              parsedReminder.formatted_date,
              parsedReminder.formatted_time,
              parsedReminder.repeat_type
            );
            
            clearUserState(chatId);
          } else {
            await sendTelegramParseErrorMessage(chatId);
            clearUserState(chatId);
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramParseErrorMessage(chatId);
          clearUserState(chatId);
        }
        
        return res.status(200).json({ ok: true });
      }
      
      // STATE: waiting_reschedule
      if (userState && userState.state === 'waiting_reschedule') {
        console.log('[TELEGRAM] Processing reschedule');
        
        try {
          const parsedTime = await parseReminderMessage(`remind me to placeholder ${messageText}`);
          
          if (parsedTime && parsedTime.remind_at) {
            const reminderId = userState.data.reminderId;
            const updated = await updateReminderTime(reminderId, parsedTime.remind_at);
            
            const formattedDate = moment.tz(updated.remind_at, 'Asia/Kolkata').format('Do MMMM YYYY');
            const formattedTime = moment.tz(updated.remind_at, 'Asia/Kolkata').format('h:mm A');
            
            await sendTelegramMessage(chatId, `✅ Rescheduled to ${formattedDate} at ${formattedTime}`);
            clearUserState(chatId);
          } else {
            await sendTelegramMessage(chatId, "I couldn't understand that time. Please try again with a format like: tomorrow 9PM or 25th March 6PM");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, I couldn't process that time.");
        }
        
        return res.status(200).json({ ok: true });
      }
      
      // No active state or unrecognized input
      // Check if it's a number without context
      if (messageText >= '1' && messageText <= '7' && messageText.length === 1) {
        console.log('[TELEGRAM] Number typed without context - showing menu');
        await showMainMenu(chatId);
        return res.status(200).json({ ok: true });
      }
      
      // Parse as natural language reminder
      console.log('[TELEGRAM] Parsing as natural language reminder...');
      
      try {
        const parsedReminder = await parseReminderMessage(messageText);
        
        if (parsedReminder) {
          console.log('[TELEGRAM] ✓ Parsed successfully');
          
          // Check free plan limit
          if (user.plan_type === 'free') {
            const activeCount = await getActiveReminderCount(user.id);
            
            if (activeCount >= 3) {
              await sendTelegramMessage(
                chatId,
                "⚠️ You've used all 3 free reminders.\nReply UPGRADE to get unlimited reminders for ₹49/month"
              );
              return res.status(200).json({ ok: true });
            }
          }
          
          // Create reminder
          const reminder = await createReminder(
            user.id,
            parsedReminder.reminder_text,
            parsedReminder.remind_at,
            parsedReminder.repeat_type
          );
          
          // Send confirmation
          await sendTelegramReminderConfirmation(
            chatId,
            parsedReminder.reminder_text,
            parsedReminder.formatted_date,
            parsedReminder.formatted_time,
            parsedReminder.repeat_type
          );
          
        } else {
          await sendTelegramParseErrorMessage(chatId);
        }
        
      } catch (error) {
        console.error('[TELEGRAM ERROR]:', error);
        await sendTelegramParseErrorMessage(chatId);
      }
    }
    
    // Always return 200 OK to Telegram
    res.status(200).json({ ok: true });
    
  } catch (error) {
    console.error('[TELEGRAM WEBHOOK ERROR]:', error);
    res.status(200).json({ ok: true });
  }
});

/**
 * GET /api/telegram/setup-webhook
 * Automatically set up the Telegram webhook - just visit this URL in browser
 */
router.get('/setup-webhook', async (req, res) => {
  try {
    const { setTelegramWebhook, getTelegramWebhookInfo } = require('../services/telegramService');
    
    // Get APP_URL from environment or use default
    const appUrl = process.env.APP_URL || 'https://whatsapp-reminder-bot-i2e2.onrender.com';
    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    
    console.log('[TELEGRAM SETUP] Setting webhook to:', webhookUrl);
    
    await setTelegramWebhook(webhookUrl);
    const info = await getTelegramWebhookInfo();
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Telegram Webhook Setup</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
          .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; }
          .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 15px; border-radius: 5px; margin-top: 20px; }
          pre { background: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto; }
          h1 { color: #0088cc; }
        </style>
      </head>
      <body>
        <h1>✅ Telegram Webhook Setup Successful!</h1>
        <div class="success">
          <strong>Webhook URL:</strong> ${webhookUrl}<br>
          <strong>Status:</strong> Active
        </div>
        <div class="info">
          <strong>Current Webhook Info:</strong>
          <pre>${JSON.stringify(info, null, 2)}</pre>
        </div>
        <p>Your Telegram bot is now ready to receive messages!</p>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('[TELEGRAM SETUP ERROR]:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Webhook Setup Failed</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>❌ Failed to Set Up Webhook</h1>
        <div class="error">
          <strong>Error:</strong> ${error.message}<br>
          <strong>Details:</strong> ${JSON.stringify(error.response?.data || {}, null, 2)}
        </div>
      </body>
      </html>
    `);
  }
});

/**
 * POST /api/telegram/setup-webhook
 * Helper endpoint to set up the Telegram webhook
 * Call this once after deployment with your webhook URL
 */
router.post('/setup-webhook', async (req, res) => {
  try {
    const { webhook_url } = req.body;
    
    if (!webhook_url) {
      return res.status(400).json({ 
        error: 'Missing webhook_url in request body',
        example: { webhook_url: 'https://your-domain.com/api/telegram/webhook' }
      });
    }
    
    const { setTelegramWebhook, getTelegramWebhookInfo } = require('../services/telegramService');
    
    await setTelegramWebhook(webhook_url);
    const info = await getTelegramWebhookInfo();
    
    res.json({
      success: true,
      message: 'Telegram webhook configured successfully',
      webhook_info: info
    });
    
  } catch (error) {
    console.error('[TELEGRAM SETUP ERROR]:', error);
    res.status(500).json({
      error: 'Failed to set webhook',
      details: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/telegram/webhook-info
 * Get current webhook information
 */
router.get('/webhook-info', async (req, res) => {
  try {
    const { getTelegramWebhookInfo } = require('../services/telegramService');
    const info = await getTelegramWebhookInfo();
    
    res.json({
      success: true,
      webhook_info: info
    });
  } catch (error) {
    console.error('[TELEGRAM INFO ERROR]:', error);
    res.status(500).json({
      error: 'Failed to get webhook info',
      details: error.message
    });
  }
});

module.exports = router;
