const express = require('express');
const router = express.Router();
const { getOrCreateUser, getUserByPhone } = require('../services/userService');
const { createReminder, getActiveReminderCount } = require('../services/reminderService');
const { parseReminderMessage } = require('../services/reminderParser');
const { sendReminderConfirmation, sendParseErrorMessage, sendWhatsAppMessage } = require('../services/whatsappService');
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

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

/**
 * GET /api/webhook - Webhook Verification Endpoint
 * Meta will send a GET request with hub.mode, hub.verify_token, and hub.challenge
 * We need to verify the token and return the challenge
 */
router.get('/', (req, res) => {
  console.log('\n[WEBHOOK VERIFICATION] Received GET request');
  console.log('Query params:', req.query);
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  // Check if mode and token are correct
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK VERIFICATION] ✓ Verification successful');
    console.log('[WEBHOOK VERIFICATION] Returning challenge:', challenge);
    
    // Respond with the challenge to verify webhook
    res.status(200).send(challenge);
  } else {
    console.log('[WEBHOOK VERIFICATION] ✗ Verification failed');
    console.log('Expected token:', VERIFY_TOKEN);
    console.log('Received token:', token);
    
    // Respond with 403 Forbidden if verification fails
    res.status(403).json({ error: 'Verification failed' });
  }
});

/**
 * POST /api/webhook - Receive Incoming WhatsApp Messages
 * Meta will send incoming messages to this endpoint
 */
router.post('/', async (req, res) => {
  console.log('\n[WEBHOOK MESSAGE] Received POST request');
  
  try {
    const body = req.body;
    
    // Check if this is a WhatsApp message notification
    if (body.object === 'whatsapp_business_account') {
      console.log('\n[WHATSAPP MESSAGE] Processing WhatsApp notification...');
      
      // Extract message details
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from; // Sender's phone number
        const messageBody = message.text?.body || '';
        const messageType = message.type;
        const messageId = message.id;
        const timestamp = message.timestamp;
        
        console.log('\n========================================');
        console.log('INCOMING MESSAGE DETAILS:');
        console.log('========================================');
        console.log('From:', from);
        console.log('Message ID:', messageId);
        console.log('Type:', messageType);
        console.log('Timestamp:', timestamp);
        console.log('Message:', messageBody);
        console.log('========================================\n');
        
        // Process only text messages
        if (messageType === 'text' && messageBody) {
          const messageUpper = messageBody.trim().toUpperCase();
          const messageTrimmed = messageBody.trim();
          
          // Get or create user first (needed for all flows)
          const user = await getOrCreateUser(from);
          
          // Check for commands
          if (messageUpper === 'DONE') {
            console.log('[PROCESSING] Detected command: DONE');
            
            try {
              const recentReminder = await getMostRecentReminder(user.id);
              
              if (!recentReminder) {
                await sendWhatsAppMessage(from, "You don't have any active reminders.");
              } else {
                await markReminderDone(recentReminder.id);
                await sendWhatsAppMessage(from, "✅ Marked as done!");
                console.log(`[PROCESSING] ✓ Marked reminder ${recentReminder.id} as done`);
              }
            } catch (error) {
              console.error('[PROCESSING ERROR]:', error);
              await sendWhatsAppMessage(from, "Sorry, there was an error processing your request.");
            }
            
          } else if (messageUpper === 'SNOOZE') {
            console.log('[PROCESSING] Detected command: SNOOZE');
            
            try {
              const recentReminder = await getMostRecentReminder(user.id);
              
              if (!recentReminder) {
                await sendWhatsAppMessage(from, "You don't have any active reminders.");
              } else {
                await snoozeReminder(recentReminder.id);
                await sendWhatsAppMessage(from, "⏰ Snoozed for 2 hours!");
                console.log(`[PROCESSING] ✓ Snoozed reminder ${recentReminder.id} by 2 hours`);
              }
            } catch (error) {
              console.error('[PROCESSING ERROR]:', error);
              await sendWhatsAppMessage(from, "Sorry, there was an error processing your request.");
            }
            
          } else if (messageUpper === 'RESCHEDULE') {
            console.log('[PROCESSING] Detected command: RESCHEDULE');
            
            try {
              const recentReminder = await getMostRecentReminder(user.id);
              
              if (!recentReminder) {
                await sendWhatsAppMessage(from, "You don't have any active reminders.");
              } else {
                // Set user state to waiting for reschedule time
                setUserState(from, 'waiting_reschedule', { reminderId: recentReminder.id });
                await sendWhatsAppMessage(
                  from, 
                  "When should I remind you?\nExample: tomorrow 9PM or 25th March 6PM"
                );
                console.log(`[PROCESSING] Waiting for reschedule time from user`);
              }
            } catch (error) {
              console.error('[PROCESSING ERROR]:', error);
              await sendWhatsAppMessage(from, "Sorry, there was an error processing your request.");
            }
            
          } else if (messageUpper === 'MY REMINDERS') {
            console.log('[PROCESSING] Detected command: MY REMINDERS');
            
            try {
              const reminders = await getActiveRemindersFormatted(user.id);
              
              if (reminders.length === 0) {
                await sendWhatsAppMessage(from, "You don't have any active reminders.");
              } else {
                const reminderList = reminders.map(r => r.displayText).join('\n\n');
                const message = `📝 Your Active Reminders:\n\n${reminderList}\n\nTo delete: Send DELETE [number]`;
                await sendWhatsAppMessage(from, message);
                console.log(`[PROCESSING] Sent ${reminders.length} reminders to user`);
              }
            } catch (error) {
              console.error('[PROCESSING ERROR]:', error);
              await sendWhatsAppMessage(from, "Sorry, there was an error fetching your reminders.");
            }
            
          } else if (messageUpper === 'UPGRADE') {
            console.log('[PROCESSING] Detected command: UPGRADE');
            
            try {
              // Check if user is already on a paid plan
              if (user.plan_type !== 'free') {
                await sendWhatsAppMessage(from, `You're already on the ${user.plan_type} plan! 🎉`);
                console.log(`[PROCESSING] User already on ${user.plan_type} plan`);
              } else {
                // Generate Razorpay payment link
                console.log('[PROCESSING] Creating Razorpay payment link...');
                const paymentLink = await createPaymentLink(from, user.id);
                
                const message = `💳 Upgrade to Personal Plan\n\n✨ Unlimited reminders\n💰 ₹49/month\n\nPay here: ${paymentLink.short_url}`;
                await sendWhatsAppMessage(from, message);
                console.log(`[PROCESSING] ✓ Payment link sent to user`);
              }
            } catch (error) {
              console.error('[PROCESSING ERROR]:', error);
              await sendWhatsAppMessage(from, "Sorry, there was an error generating the payment link. Please try again later.");
            }
            
          } else if (messageUpper === 'HELP') {
            console.log('[PROCESSING] Detected command: HELP');
            
            try {
              const helpMessage = `🤖 ReminderBot Commands:
• Just type naturally to set a reminder
• MY REMINDERS — see all your reminders
• DONE — mark last reminder complete
• SNOOZE — remind me in 2 hours
• RESCHEDULE — change reminder time
• DELETE [number] — delete a reminder
• UPGRADE — get Personal plan ₹49/month
• HELP — show this menu`;
              
              await sendWhatsAppMessage(from, helpMessage);
              console.log('[PROCESSING] ✓ Help message sent');
            } catch (error) {
              console.error('[PROCESSING ERROR]:', error);
              await sendWhatsAppMessage(from, "Sorry, there was an error sending the help message.");
            }
            
          } else if (messageUpper.startsWith('DELETE ')) {
            console.log('[PROCESSING] Detected command: DELETE');
            
            try {
              const numberMatch = messageTrimmed.match(/DELETE\s+(\d+)/i);
              
              if (!numberMatch) {
                await sendWhatsAppMessage(from, "Please specify a reminder number. Example: DELETE 2");
              } else {
                const reminderNumber = parseInt(numberMatch[1]);
                const reminders = await getActiveRemindersFormatted(user.id);
                
                if (reminderNumber < 1 || reminderNumber > reminders.length) {
                  await sendWhatsAppMessage(from, `Invalid reminder number. You have ${reminders.length} active reminder(s).`);
                } else {
                  const reminderToDelete = reminders[reminderNumber - 1];
                  const deleted = await deleteReminder(reminderToDelete.id, user.id);
                  
                  if (deleted) {
                    await sendWhatsAppMessage(from, "🗑️ Reminder deleted");
                    console.log(`[PROCESSING] ✓ Deleted reminder ${reminderToDelete.id}`);
                  } else {
                    await sendWhatsAppMessage(from, "Could not delete reminder. Please try again.");
                  }
                }
              }
            } catch (error) {
              console.error('[PROCESSING ERROR]:', error);
              await sendWhatsAppMessage(from, "Sorry, there was an error deleting the reminder.");
            }
            
          } else {
            // Check if user is in a conversation state (e.g., waiting for reschedule time)
            const userState = getUserState(from);
            
            if (userState && userState.state === 'waiting_reschedule') {
              console.log('[PROCESSING] User in reschedule mode, parsing new time...');
              
              try {
                // Parse the new time with OpenAI
                const parsedTime = await parseReminderMessage(`remind me to placeholder ${messageTrimmed}`);
                
                if (parsedTime && parsedTime.remind_at) {
                  const reminderId = userState.data.reminderId;
                  const updated = await updateReminderTime(reminderId, parsedTime.remind_at);
                  
                  const formattedDate = moment.tz(updated.remind_at, 'Asia/Kolkata').format('Do MMMM YYYY');
                  const formattedTime = moment.tz(updated.remind_at, 'Asia/Kolkata').format('h:mm A');
                  
                  await sendWhatsAppMessage(from, `✅ Rescheduled to ${formattedDate} at ${formattedTime}`);
                  console.log(`[PROCESSING] ✓ Rescheduled reminder ${reminderId}`);
                  
                  // Clear state
                  clearUserState(from);
                } else {
                  await sendWhatsAppMessage(from, "I couldn't understand that time. Please try again with a format like: tomorrow 9PM or 25th March 6PM");
                }
              } catch (error) {
                console.error('[PROCESSING ERROR]:', error);
                await sendWhatsAppMessage(from, "Sorry, I couldn't process that time. Please try again.");
              }
              
            } else {
              // Not a command and not in conversation state - parse as new reminder
              console.log('[PROCESSING] Parsing as new reminder with Gemini...');
              
              try {
                const parsedReminder = await parseReminderMessage(messageBody);
                
                if (parsedReminder) {
                  console.log('[PROCESSING] ✓ Successfully parsed reminder');
                  console.log('[PROCESSING] Reminder text:', parsedReminder.reminder_text);
                  console.log('[PROCESSING] Remind at:', parsedReminder.remind_at);
                  console.log('[PROCESSING] Repeat type:', parsedReminder.repeat_type);
                  
                  // Check free plan limit
                  if (user.plan_type === 'free') {
                    const activeCount = await getActiveReminderCount(user.id);
                    console.log('[PROCESSING] User is on free plan. Active reminders:', activeCount);
                    
                    if (activeCount >= 3) {
                      console.log('[PROCESSING] ✗ Free plan limit reached (3 reminders)');
                      await sendWhatsAppMessage(
                        from,
                        "⚠️ Free plan allows only 3 reminders. Upgrade to Personal plan for ₹49/month — reply UPGRADE to get the payment link"
                      );
                      return; // Don't create the reminder
                    }
                  }
                  
                  // Create reminder in database
                  console.log('[PROCESSING] Creating reminder in database...');
                  const reminder = await createReminder(
                    user.id,
                    parsedReminder.reminder_text,
                    parsedReminder.remind_at,
                    parsedReminder.repeat_type
                  );
                  console.log('[PROCESSING] ✓ Reminder created with ID:', reminder.id);
                  
                  // Send confirmation to user
                  console.log('[PROCESSING] Sending confirmation to user...');
                  await sendReminderConfirmation(
                    from,
                    parsedReminder.reminder_text,
                    parsedReminder.formatted_date,
                    parsedReminder.formatted_time,
                    parsedReminder.repeat_type
                  );
                  console.log('[PROCESSING] ✓ Confirmation sent\n');
                  
                } else {
                  // Not a reminder or couldn't parse
                  console.log('[PROCESSING] ✗ Message is not a reminder request');
                  await sendParseErrorMessage(from);
                }
                
              } catch (error) {
                console.error('[PROCESSING ERROR]:', error);
                // Send error message to user
                await sendParseErrorMessage(from);
              }
            }
          }
        } else {
          console.log('[PROCESSING] Skipping non-text message');
        }
        
      } else {
        console.log('[WEBHOOK] Received notification but no messages found');
      }
    } else {
      console.log('[WEBHOOK] Received non-WhatsApp notification');
    }
    
    // Always return 200 OK to acknowledge receipt
    res.status(200).json({ status: 'received' });
    
  } catch (error) {
    console.error('[WEBHOOK ERROR]:', error);
    // Still return 200 to prevent Meta from retrying
    res.status(200).json({ status: 'error', message: error.message });
  }
});

module.exports = router;