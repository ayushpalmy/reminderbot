const express = require('express');
const router = express.Router();
const { getOrCreateTelegramUser, getUserByTelegramChatId } = require('../services/userService');
const { createReminder, getActiveReminderCount } = require('../services/reminderService');
const { parseReminderMessage, parseTimeInput, resolveAmbiguousTime, detectLanguage } = require('../services/reminderParser');
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
const { getMessage } = require('../services/multilingualMessages');
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
 * Helper to check if user is in middle of reminder setup
 * Returns the current question if in setup, null otherwise
 */
function getReminderSetupContext(userState) {
  if (!userState || !userState.state) return null;
  
  const reminderStates = {
    'template_medicine_name': 'What medicine should I remind you about?',
    'template_medicine_frequency': 'How often?\n\n1. Daily\n2. Weekly\n3. Monthly\n4. One time',
    'template_medicine_time': 'At what time? Example: 9AM or 8:30PM',
    'template_bill_date': 'Which date every month? Example: 5th or 15th',
    'template_bill_time': 'At what time? Example: 9AM',
    'template_rent_date': 'Which date every month? Example: 1st',
    'template_activity_frequency': 'How often?\n\n1. Daily\n2. Weekly\n3. Monthly\n4. One time',
    'template_activity_time': 'At what time? Example: 6PM',
    'waiting_custom_reminder': 'What would you like to be reminded about?',
    'waiting_natural_time': 'When should I remind you? Example: today 6PM, tomorrow 9AM, every day 8PM'
  };
  
  return reminderStates[userState.state] || null;
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
      
      // Handle /start for new users (IMPROVEMENT 4: Warm welcome)
      if (messageUpper === '/START' && isNewUser) {
        console.log('[TELEGRAM] New user - showing warm welcome message');
        await sendTelegramMessage(
          chatId,
          "👋 Namaste! Welcome to ReminderBot! 🤖\n\nI help you never forget your bills, medicines, and important tasks — all inside Telegram!\n\n🎁 You get 3 FREE reminders to start.\n\nType Hi or Hello to see what I can do for you!"
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
      
      // Check if user typed something unrelated while in reminder setup
      const setupContext = getReminderSetupContext(userState);
      if (setupContext && !['CANCEL', 'MY REMINDERS', 'UPGRADE', 'HELP', '/HELP'].includes(messageUpper)) {
        // Check if input seems unrelated (like greetings or random text)
        const unrelatedPatterns = ['WHO ARE YOU', 'WHAT CAN YOU DO', 'THANKS', 'THANK YOU', 'OK', 'OKAY'];
        if (unrelatedPatterns.some(pattern => messageUpper.includes(pattern))) {
          const templateName = userState.data.text || userState.data.medicineName || 'your reminder';
          await sendTelegramMessage(
            chatId,
            `Let's finish setting up your ${templateName} first.\n\n${setupContext}`
          );
          return res.status(200).json({ ok: true });
        }
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
      
      // Handle UPGRADE (IMPROVEMENT 1: treat multiple keywords as UPGRADE)
      const upgradeKeywords = ['UPGRADE', 'LINK', 'PAYMENT', 'PAY', 'BUY', 'SUBSCRIBE'];
      if (upgradeKeywords.some(keyword => messageUpper.includes(keyword))) {
        console.log('[TELEGRAM] Command: UPGRADE (via keyword)');
        
        try {
          if (user.plan_type !== 'free') {
            await sendTelegramMessage(chatId, `You're already on the ${user.plan_type} plan! 🎉`);
          } else {
            // Detect language
            const language = await detectLanguage(messageText);
            
            const paymentLink = await createPaymentLink(chatId, user.id);
            const message = getMessage('upgrade_message', language, { link: paymentLink.short_url });
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
          
          // Check free plan limit first (IMPROVEMENT 1: Show payment link automatically)
          if (user.plan_type === 'free') {
            const activeCount = await getActiveReminderCount(user.id);
            
            if (activeCount >= 3) {
              try {
                // Detect language
                const language = await detectLanguage(messageText);
                
                // Create payment link
                const paymentLink = await createPaymentLink(chatId, user.id);
                const message = getMessage('limit_reached', language, { link: paymentLink.short_url });
                
                await sendTelegramMessage(chatId, message);
              } catch (error) {
                console.error('[TELEGRAM ERROR]:', error);
                await sendTelegramMessage(chatId, "⚠️ You've used all 3 free reminders. Reply UPGRADE to get unlimited reminders.");
              }
              
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
              setUserState(chatId, 'template_medicine_name', { templateNum, templateType: 'medicine', emoji: template.emoji });
              await sendTelegramMessage(chatId, `${template.emoji} Medicine reminder — What medicine should I remind you about?`);
              
            } else if (template.type === 'bill' || template.type === 'creditcard') {
              setUserState(chatId, 'template_bill_date', { templateNum, text: template.text, templateType: template.type, emoji: template.emoji });
              await sendTelegramMessage(chatId, `${template.emoji} ${template.text} — Which date every month should I remind you?\nExample: 5th or 15th`);
              
            } else if (template.type === 'rent') {
              setUserState(chatId, 'template_rent_date', { templateNum, templateType: 'rent', emoji: template.emoji });
              await sendTelegramMessage(chatId, `${template.emoji} Rent payment — Which date every month should I remind you?\nExample: 1st or 5th`);
              
            } else if (template.type === 'gym' || template.type === 'study') {
              setUserState(chatId, 'template_activity_frequency', { templateNum, text: template.text, emoji: template.emoji, templateType: template.type });
              await sendTelegramMessage(chatId, `${template.emoji} ${template.text} reminder — How often?\n\n1. Daily\n2. Weekly\n3. Monthly\n4. One time`);
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
        setUserState(chatId, 'template_medicine_frequency', { 
          medicineName: messageText,
          templateType: userState.data.templateType,
          emoji: userState.data.emoji
        });
        await sendTelegramMessage(chatId, "Got it! How often?\n\n1. Daily\n2. Weekly\n3. Monthly\n4. One time");
        return res.status(200).json({ ok: true });
      }
      
      // Medicine flow: Step 2 - got frequency, ask time (BUG FIX 3: Handle numbered options)
      if (userState && userState.state === 'template_medicine_frequency') {
        const frequency = messageUpper;
        let repeatType = 'once';
        
        // Handle both numbers and text
        if (messageText === '1' || frequency.includes('DAILY') || frequency.includes('DAY')) {
          repeatType = 'daily';
        } else if (messageText === '2' || frequency.includes('WEEKLY') || frequency.includes('WEEK')) {
          repeatType = 'weekly';
        } else if (messageText === '3' || frequency.includes('MONTHLY') || frequency.includes('MONTH')) {
          repeatType = 'monthly';
        } else if (messageText === '4' || frequency.includes('ONE TIME') || frequency.includes('ONCE')) {
          repeatType = 'once';
        }
        
        setUserState(chatId, 'template_medicine_time', { 
          medicineName: userState.data.medicineName,
          repeatType,
          templateType: userState.data.templateType,
          emoji: userState.data.emoji
        });
        await sendTelegramMessage(chatId, "At what time?\nExample: 9AM or 8:30PM");
        return res.status(200).json({ ok: true });
      }
      
      // Medicine flow: Step 3 - got time, create reminder (BUG FIX 4: Smart time parsing)
      if (userState && userState.state === 'template_medicine_time') {
        try {
          const medicineName = userState.data.medicineName;
          const repeatType = userState.data.repeatType;
          
          // Smart time parsing
          const parsedTime = await parseTimeInput(messageText, `take ${medicineName}`);
          
          if (parsedTime && parsedTime.remind_at) {
            const reminderText = `Take ${medicineName}`;
            const reminder = await createReminder(
              user.id,
              reminderText,
              parsedTime.remind_at,
              repeatType
            );
            
            const repeatInfo = repeatType === 'daily' ? ' every day' : repeatType === 'weekly' ? ' every week' : repeatType === 'monthly' ? ' every month' : '';
            await sendTelegramMessage(chatId, `✅ Reminder set — ${reminderText}${repeatInfo} at ${parsedTime.formatted_time}`);
            clearUserState(chatId);
          } else {
            await sendTelegramMessage(chatId, "I couldn't understand that time. Please try again with a format like: 9AM or 3:30PM or just 5");
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
        
        setUserState(chatId, 'template_bill_time', { 
          date, 
          billText,
          templateType: userState.data.templateType,
          emoji: userState.data.emoji
        });
        await sendTelegramMessage(chatId, "At what time?\nExample: 9AM or 10AM");
        return res.status(200).json({ ok: true });
      }
      
      // Bill/Rent flow: Step 2 - got time, create reminder (BUG FIX 4: Smart time parsing)
      if (userState && userState.state === 'template_bill_time') {
        try {
          const date = userState.data.date;
          const billText = userState.data.billText;
          
          // Smart time parsing
          const parsedTime = await parseTimeInput(messageText, `${billText} on ${date}th of every month`);
          
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
            await sendTelegramMessage(chatId, "I couldn't understand that time. Please try again with a format like: 9AM or 10AM or just 9");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, I couldn't process that.");
          clearUserState(chatId);
        }
        return res.status(200).json({ ok: true });
      }
      
      // Gym/Study flow: Step 1 - got frequency, ask time (BUG FIX 3: Handle numbered options)
      if (userState && userState.state === 'template_activity_frequency') {
        const frequency = messageUpper;
        let repeatType = 'once';
        
        // Handle both numbers and text
        if (messageText === '1' || frequency.includes('DAILY') || frequency.includes('DAY')) {
          repeatType = 'daily';
        } else if (messageText === '2' || frequency.includes('WEEKLY') || frequency.includes('WEEK')) {
          repeatType = 'weekly';
        } else if (messageText === '3' || frequency.includes('MONTHLY') || frequency.includes('MONTH')) {
          repeatType = 'monthly';
        } else if (messageText === '4' || frequency.includes('ONE TIME') || frequency.includes('ONCE')) {
          repeatType = 'once';
        }
        
        setUserState(chatId, 'template_activity_time', { 
          text: userState.data.text,
          emoji: userState.data.emoji,
          repeatType,
          templateType: userState.data.templateType
        });
        await sendTelegramMessage(chatId, "At what time?\nExample: 6PM or 7:30AM");
        return res.status(200).json({ ok: true });
      }
      
      // Gym/Study flow: Step 2 - got time, create reminder (BUG FIX 4: Smart time parsing)
      if (userState && userState.state === 'template_activity_time') {
        try {
          const activityText = userState.data.text;
          const repeatType = userState.data.repeatType;
          
          // Smart time parsing
          const parsedTime = await parseTimeInput(messageText, activityText);
          
          if (parsedTime && parsedTime.remind_at) {
            const reminder = await createReminder(
              user.id,
              activityText,
              parsedTime.remind_at,
              repeatType
            );
            
            const repeatInfo = repeatType === 'daily' ? ' every day' : repeatType === 'weekly' ? ' every week' : repeatType === 'monthly' ? ' every month' : '';
            await sendTelegramMessage(chatId, `✅ Reminder set — ${activityText}${repeatInfo} at ${parsedTime.formatted_time}`);
            clearUserState(chatId);
          } else {
            await sendTelegramMessage(chatId, "I couldn't understand that time. Please try again with a format like: 6PM or 7:30AM or just 6");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, I couldn't process that time.");
          clearUserState(chatId);
        }
        return res.status(200).json({ ok: true });
      }
      
      // STATE: waiting_custom_reminder (IMPROVEMENT 2: Multilingual support)
      if (userState && userState.state === 'waiting_custom_reminder') {
        console.log('[TELEGRAM] Processing custom reminder text');
        
        try {
          // Try to extract just the reminder text first with language detection
          const extractedText = await parseReminderMessage(messageText, true);
          
          if (extractedText && extractedText.reminder_text) {
            const language = extractedText.detected_language || 'english';
            
            // Got reminder text, now ask for time in user's language
            setUserState(chatId, 'waiting_natural_time', { 
              reminderText: extractedText.reminder_text,
              language
            });
            
            const askMessage = getMessage('ask_time', language);
            await sendTelegramMessage(chatId, askMessage);
          } else {
            await sendTelegramMessage(chatId, "I couldn't understand that. Please tell me what you want to be reminded about.");
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, I couldn't understand that. Please try again.");
        }
        
        return res.status(200).json({ ok: true });
      }
      
      // STATE: waiting_natural_time (IMPROVEMENT 2 & 3: Multilingual + Ambiguous time)
      if (userState && userState.state === 'waiting_natural_time') {
        console.log('[TELEGRAM] Processing natural reminder time');
        
        try {
          const reminderText = userState.data.reminderText;
          const language = userState.data.language || 'english';
          
          // Parse time input with smart parsing
          const parsedTime = await parseTimeInput(messageText, reminderText, language);
          
          // IMPROVEMENT 3: Handle ambiguous time (5, 6, 7 without AM/PM)
          if (parsedTime && parsedTime.ambiguous_time) {
            setUserState(chatId, 'waiting_am_pm', {
              reminderText: parsedTime.reminder_text,
              ambiguousHour: parsedTime.ambiguous_hour,
              repeatType: parsedTime.repeat_type || 'once',
              language
            });
            
            const message = getMessage('ask_am_pm', language, { hour: parsedTime.ambiguous_hour });
            await sendTelegramMessage(chatId, message);
            return res.status(200).json({ ok: true });
          }
          
          if (parsedTime && parsedTime.remind_at) {
            const reminder = await createReminder(
              user.id,
              reminderText,
              parsedTime.remind_at,
              parsedTime.repeat_type
            );
            
            // IMPROVEMENT 2: Multilingual confirmation
            let repeatInfo = '';
            if (parsedTime.repeat_type === 'daily') {
              repeatInfo = getMessage('repeat_daily', language);
            } else if (parsedTime.repeat_type === 'weekly') {
              repeatInfo = getMessage('repeat_weekly', language);
            } else if (parsedTime.repeat_type === 'monthly') {
              repeatInfo = getMessage('repeat_monthly', language);
            }
            
            const confirmMessage = getMessage('reminder_set', language, {
              text: reminderText,
              date: parsedTime.formatted_date,
              time: parsedTime.formatted_time,
              repeat: repeatInfo
            });
            await sendTelegramMessage(chatId, confirmMessage);
            
            clearUserState(chatId);
          } else {
            const askMessage = getMessage('ask_time', language);
            await sendTelegramMessage(chatId, askMessage);
          }
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, I couldn't process that time.");
          clearUserState(chatId);
        }
        
        return res.status(200).json({ ok: true });
      }
      
      // STATE: waiting_am_pm (IMPROVEMENT 3: Resolve ambiguous time)
      if (userState && userState.state === 'waiting_am_pm') {
        console.log('[TELEGRAM] Resolving AM/PM choice');
        
        try {
          const ampm = messageUpper.includes('AM') ? 'AM' : messageUpper.includes('PM') ? 'PM' : null;
          
          if (!ampm) {
            const message = getMessage('ask_am_pm', userState.data.language, { hour: userState.data.ambiguousHour });
            await sendTelegramMessage(chatId, message);
            return res.status(200).json({ ok: true });
          }
          
          const resolvedTime = resolveAmbiguousTime(
            userState.data.ambiguousHour,
            ampm,
            userState.data.reminderText,
            userState.data.repeatType
          );
          
          const reminder = await createReminder(
            user.id,
            resolvedTime.reminder_text,
            resolvedTime.remind_at,
            resolvedTime.repeat_type
          );
          
          let repeatInfo = '';
          if (resolvedTime.repeat_type === 'daily') {
            repeatInfo = getMessage('repeat_daily', userState.data.language);
          } else if (resolvedTime.repeat_type === 'weekly') {
            repeatInfo = getMessage('repeat_weekly', userState.data.language);
          } else if (resolvedTime.repeat_type === 'monthly') {
            repeatInfo = getMessage('repeat_monthly', userState.data.language);
          }
          
          const confirmMessage = getMessage('reminder_set', userState.data.language, {
            text: resolvedTime.reminder_text,
            date: resolvedTime.formatted_date,
            time: resolvedTime.formatted_time,
            repeat: repeatInfo
          });
          await sendTelegramMessage(chatId, confirmMessage);
          
          clearUserState(chatId);
        } catch (error) {
          console.error('[TELEGRAM ERROR]:', error);
          await sendTelegramMessage(chatId, "Sorry, there was an error.");
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
      
      // Parse as natural language reminder (BUG FIX 1 & 2: Extract text first, ask time)
      console.log('[TELEGRAM] Parsing as natural language reminder...');
      
      try {
        // First try full parse with time
        const parsedReminder = await parseReminderMessage(messageText);
        
        if (parsedReminder && parsedReminder.remind_at) {
          console.log('[TELEGRAM] ✓ Parsed successfully with time');
          
          // Check free plan limit (IMPROVEMENT 1: Show payment link automatically)
          if (user.plan_type === 'free') {
            const activeCount = await getActiveReminderCount(user.id);
            
            if (activeCount >= 3) {
              try {
                const language = await detectLanguage(messageText);
                const paymentLink = await createPaymentLink(chatId, user.id);
                const message = getMessage('limit_reached', language, { link: paymentLink.short_url });
                await sendTelegramMessage(chatId, message);
              } catch (error) {
                await sendTelegramMessage(chatId, "⚠️ You've used all 3 free reminders. Reply UPGRADE.");
              }
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
          // Try to extract just the reminder text without time
          console.log('[TELEGRAM] No time found, extracting text only...');
          const extractedText = await parseReminderMessage(messageText, true);
          
          if (extractedText && extractedText.reminder_text) {
            // Check free plan limit before asking for time (IMPROVEMENT 1)
            if (user.plan_type === 'free') {
              const activeCount = await getActiveReminderCount(user.id);
              
              if (activeCount >= 3) {
                try {
                  const language = extractedText.detected_language || 'english';
                  const paymentLink = await createPaymentLink(chatId, user.id);
                  const message = getMessage('limit_reached', language, { link: paymentLink.short_url });
                  await sendTelegramMessage(chatId, message);
                } catch (error) {
                  await sendTelegramMessage(chatId, "⚠️ You've used all 3 free reminders. Reply UPGRADE.");
                }
                return res.status(200).json({ ok: true });
              }
            }
            
            // Got reminder text without time - ask for time (IMPROVEMENT 2: Multilingual)
            const language = extractedText.detected_language || 'english';
            setUserState(chatId, 'waiting_natural_time', { 
              reminderText: extractedText.reminder_text,
              language
            });
            
            const askMessage = getMessage('ask_time', language);
            await sendTelegramMessage(chatId, askMessage);
          } else {
            await sendTelegramParseErrorMessage(chatId);
          }
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
