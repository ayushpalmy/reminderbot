const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_URL = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

/**
 * Send a text message to a WhatsApp user
 * @param {string} to - Recipient phone number
 * @param {string} message - Message text
 * @returns {Promise<Object>}
 */
async function sendWhatsAppMessage(to, message) {
  try {
    console.log(`\n[WHATSAPP] Sending message to ${to}`);
    console.log(`[WHATSAPP] Message: ${message}`);
    
    const response = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('[WHATSAPP] ✓ Message sent successfully');
    console.log('[WHATSAPP] Message ID:', response.data.messages[0].id);
    
    return response.data;
  } catch (error) {
    console.error('[WHATSAPP ERROR] Failed to send message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send reminder confirmation message
 * @param {string} to - Recipient phone number
 * @param {string} reminderText - What to remind
 * @param {string} date - Formatted date
 * @param {string} time - Formatted time
 * @param {string} repeatType - Repeat type
 * @returns {Promise<Object>}
 */
async function sendReminderConfirmation(to, reminderText, date, time, repeatType) {
  let repeatInfo = '';
  if (repeatType === 'daily') {
    repeatInfo = ' (repeats daily)';
  } else if (repeatType === 'weekly') {
    repeatInfo = ' (repeats weekly)';
  } else if (repeatType === 'monthly') {
    repeatInfo = ' (repeats monthly)';
  }
  
  const message = `✅ Reminder set — ${reminderText} on ${date} at ${time}${repeatInfo}`;
  return sendWhatsAppMessage(to, message);
}

/**
 * Send error message for unparseable reminders
 * @param {string} to - Recipient phone number
 * @returns {Promise<Object>}
 */
async function sendParseErrorMessage(to) {
  const message = "Sorry, I didn't understand. Try: Remind me to pay rent on 1st every month";
  return sendWhatsAppMessage(to, message);
}

module.exports = {
  sendWhatsAppMessage,
  sendReminderConfirmation,
  sendParseErrorMessage
};