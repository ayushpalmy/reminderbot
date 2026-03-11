const express = require('express');
const router = express.Router();
const { getOrCreateUser } = require('../services/userService');
const { createReminder } = require('../services/reminderService');
const { parseReminderMessage } = require('../services/reminderParser');
const { sendReminderConfirmation, sendParseErrorMessage } = require('../services/whatsappService');

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
          // Parse the reminder message using OpenAI
          console.log('[PROCESSING] Parsing reminder with OpenAI...');
          
          try {
            const parsedReminder = await parseReminderMessage(messageBody);
            
            if (parsedReminder) {
              console.log('[PROCESSING] ✓ Successfully parsed reminder');
              console.log('[PROCESSING] Reminder text:', parsedReminder.reminder_text);
              console.log('[PROCESSING] Remind at:', parsedReminder.remind_at);
              console.log('[PROCESSING] Repeat type:', parsedReminder.repeat_type);
              
              // Get or create user
              console.log('[PROCESSING] Getting/creating user...');
              const user = await getOrCreateUser(from);
              console.log('[PROCESSING] ✓ User ID:', user.id);
              
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