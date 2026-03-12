const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Send a text message to a Telegram user
 * @param {string} chatId - Telegram chat ID
 * @param {string} text - Message text
 * @returns {Promise<Object>}
 */
async function sendTelegramMessage(chatId, text) {
  try {
    console.log(`\n[TELEGRAM] Sending message to chat ${chatId}`);
    console.log(`[TELEGRAM] Message: ${text.substring(0, 100)}...`);
    
    const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });
    
    console.log('[TELEGRAM] ✓ Message sent successfully');
    
    return response.data;
  } catch (error) {
    console.error('[TELEGRAM ERROR] Failed to send message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send reminder confirmation message
 * @param {string} chatId 
 * @param {string} reminderText 
 * @param {string} date 
 * @param {string} time 
 * @param {string} repeatType 
 */
async function sendTelegramReminderConfirmation(chatId, reminderText, date, time, repeatType) {
  let repeatInfo = '';
  if (repeatType === 'daily') {
    repeatInfo = ' (repeats daily)';
  } else if (repeatType === 'weekly') {
    repeatInfo = ' (repeats weekly)';
  } else if (repeatType === 'monthly') {
    repeatInfo = ' (repeats monthly)';
  }
  
  const message = `✅ Reminder set — ${reminderText} on ${date} at ${time}${repeatInfo}`;
  return sendTelegramMessage(chatId, message);
}

/**
 * Send error message for unparseable reminders
 * @param {string} chatId 
 */
async function sendTelegramParseErrorMessage(chatId) {
  const message = "Sorry, I didn't understand. Try: Remind me to pay rent on 1st every month";
  return sendTelegramMessage(chatId, message);
}

/**
 * Set webhook for Telegram bot
 * @param {string} webhookUrl - Full webhook URL
 */
async function setTelegramWebhook(webhookUrl) {
  try {
    console.log('[TELEGRAM] Setting webhook:', webhookUrl);
    
    const response = await axios.post(`${TELEGRAM_API_URL}/setWebhook`, {
      url: webhookUrl,
      allowed_updates: ['message']
    });
    
    if (response.data.ok) {
      console.log('[TELEGRAM] ✓ Webhook set successfully');
    } else {
      console.error('[TELEGRAM] Failed to set webhook:', response.data);
    }
    
    return response.data;
  } catch (error) {
    console.error('[TELEGRAM ERROR] Failed to set webhook:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get webhook info
 */
async function getTelegramWebhookInfo() {
  try {
    const response = await axios.get(`${TELEGRAM_API_URL}/getWebhookInfo`);
    return response.data.result;
  } catch (error) {
    console.error('[TELEGRAM ERROR] Failed to get webhook info:', error.message);
    throw error;
  }
}

module.exports = {
  sendTelegramMessage,
  sendTelegramReminderConfirmation,
  sendTelegramParseErrorMessage,
  setTelegramWebhook,
  getTelegramWebhookInfo
};
