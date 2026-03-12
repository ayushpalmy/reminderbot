const express = require('express');
const router = express.Router();
const { getOrCreateTelegramUser } = require('../services/userService');
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

// Reminder templates
const REMINDER_TEMPLATES = {
  1: { text: 'Take medicine', emoji: '💊' },
  2: { text: 'Pay electricity bill', emoji: '💡' },
  3: { text: 'Pay rent', emoji: '🏠' },
  4: { text: 'Pay credit card bill', emoji: '💳' },
  5: { text: 'Go to gym', emoji: '🏋️' },
  6: { text: 'Study', emoji: '📚' }
};

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
      const messageText = update.message.text;
      const messageUpper = messageText.trim().toUpperCase();
      
      console.log(`[TELEGRAM] Chat ID: ${chatId}`);
      console.log(`[TELEGRAM] Message: ${messageText}`);
      
      // Get or create user
      const user = await getOrCreateTelegramUser(chatId);
      
      // Handle numbered responses (1, 2, 3 for DONE/SNOOZE/RESCHEDULE)
      if (messageText === '1' || messageUpper === 'DONE') {
        console.log('[TELEGRAM] Command: DONE (via number or text)');
        
        try {
          const recentReminder = await getMostRecentReminder(user.id);
          
          if (!recentReminder) {
            await sendTelegramMessage(chatId, "You don't have any active reminders.");
          } else {
            await markReminderDone(recentReminder.id);
            await sendTelegramMessage(chatId, "✅ Marked as done!");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, there was an error.");
        }
        
      } else if (messageText === '2' || messageUpper === 'SNOOZE') {
        console.log('[TELEGRAM] Command: SNOOZE (via number or text)');
        
        try {
          const recentReminder = await getMostRecentReminder(user.id);
          
          if (!recentReminder) {
            await sendTelegramMessage(chatId, "You don't have any active reminders.");
          } else {
            await snoozeReminder(recentReminder.id);
            await sendTelegramMessage(chatId, "⏰ Snoozed for 2 hours!");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, there was an error.");
        }
        
      } else if (messageText === '3' || messageUpper === 'RESCHEDULE') {
        console.log('[TELEGRAM] Command: RESCHEDULE (via number or text)');
        
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
        
      } else if (messageUpper === 'MY REMINDERS') {
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
        
      } else if (messageUpper === 'UPGRADE') {
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
        
      } else if (messageUpper === 'HELP' || messageUpper === '/START' || messageUpper === '/HELP') {
        console.log('[TELEGRAM] Command: HELP/START');
        
        try {
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
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, there was an error.");
        }
        
      } else if (messageUpper.startsWith('DELETE ')) {
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
        
      } else {
        // Check conversation state
        const userState = getUserState(chatId);
        
        // Handle template selection (numbers 1-7)
        if (messageText >= '1' && messageText <= '7' && messageText.length === 1) {
          const templateNum = parseInt(messageText);
          
          if (templateNum === 7) {
            // Custom reminder option
            console.log('[TELEGRAM] User selected custom reminder (7)');
            
            // Check free plan limit for custom reminders
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
            
            setUserState(chatId, 'waiting_custom_reminder', {});
            await sendTelegramMessage(chatId, "What would you like to be reminded about? Type naturally.");
            
          } else if (REMINDER_TEMPLATES[templateNum]) {
            // Template reminder (1-6)
            console.log(`[TELEGRAM] User selected template ${templateNum}`);
            
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
            
            const template = REMINDER_TEMPLATES[templateNum];
            setUserState(chatId, 'waiting_template_time', { 
              templateNum: templateNum,
              reminderText: template.text
            });
            await sendTelegramMessage(
              chatId, 
              `${template.emoji} ${template.text}\n\nWhen should I remind you? Example: every day at 9PM`
            );
          }
          
        } else if (userState && userState.state === 'waiting_template_time') {
          // User provided time for template reminder
          console.log('[TELEGRAM] Processing template reminder time');
          
          try {
            const reminderText = userState.data.reminderText;
            const parsedTime = await parseReminderMessage(`remind me to ${reminderText} ${messageText}`);
            
            if (parsedTime && parsedTime.remind_at) {
              const reminder = await createReminder(
                user.id,
                reminderText,
                parsedTime.remind_at,
                parsedTime.repeat_type
              );
              
              await sendTelegramReminderConfirmation(
                chatId,
                reminderText,
                parsedTime.formatted_date,
                parsedTime.formatted_time,
                parsedTime.repeat_type
              );
              
              clearUserState(chatId);
            } else {
              await sendTelegramMessage(chatId, "I couldn't understand that time. Please try again with a format like: every day at 9PM or tomorrow 3PM");
            }
          } catch (error) {
            console.error('[TELEGRAM ERROR]:', error);
            await sendTelegramMessage(chatId, "Sorry, I couldn't process that time.");
          }
          
        } else if (userState && userState.state === 'waiting_custom_reminder') {
          // User provided custom reminder text
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
          
        } else if (userState && userState.state === 'waiting_reschedule') {
          // User provided reschedule time
          console.log('[TELEGRAM] User in reschedule mode');
          
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
          
        } else {
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
