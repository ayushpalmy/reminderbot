const OpenAI = require('openai');
const moment = require('moment-timezone');

// Note: Emergent universal key works through their Python SDK
// For Node.js, you need your own OpenAI API key
// Get it from: https://platform.openai.com/api-keys
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

/**
 * Parse a natural language reminder message using OpenAI
 * @param {string} message - The user's message
 * @returns {Promise<Object>} - Parsed reminder data or null if not a reminder
 */
async function parseReminderMessage(message) {
  try {
    const currentDateTime = moment.tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const currentDay = moment.tz(TIMEZONE).format('dddd');
    const currentMonth = moment.tz(TIMEZONE).format('MMMM');
    const currentYear = moment.tz(TIMEZONE).format('YYYY');
    
    const systemPrompt = `You are a reminder parsing assistant. Your job is to extract reminder information from user messages.

Current date and time in IST: ${currentDateTime} (${currentDay}, ${currentMonth} ${currentYear})
Timezone: ${TIMEZONE}

Extract the following information:
1. reminder_text: What the user wants to be reminded about
2. remind_at: The exact date and time for the reminder in format "YYYY-MM-DD HH:mm:ss" (in IST timezone)
3. repeat_type: One of "once", "daily", "weekly", or "monthly"

Rules:
- If time is not specified, use 09:00:00 as default
- "tonight" means today at 21:00:00
- "tomorrow" means the next day
- "every day" = daily, "every week" = weekly, "every month" = monthly
- For monthly reminders with dates like "5th", use the specified date
- If no repeat is mentioned, use "once"
- If the message is not a reminder request, return null

Respond ONLY with valid JSON in this exact format:
{
  "is_reminder": true,
  "reminder_text": "text here",
  "remind_at": "YYYY-MM-DD HH:mm:ss",
  "repeat_type": "once|daily|weekly|monthly"
}

OR if not a reminder:
{
  "is_reminder": false
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const content = response.choices[0].message.content.trim();
    console.log('\n[OPENAI RESPONSE]:', content);
    
    // Parse the JSON response
    const parsed = JSON.parse(content);
    
    if (!parsed.is_reminder) {
      return null;
    }
    
    // Validate and convert remind_at to Date object
    const remindAtMoment = moment.tz(parsed.remind_at, TIMEZONE);
    if (!remindAtMoment.isValid()) {
      console.error('Invalid date format from OpenAI:', parsed.remind_at);
      return null;
    }
    
    return {
      reminder_text: parsed.reminder_text,
      remind_at: remindAtMoment.toDate(),
      repeat_type: parsed.repeat_type,
      formatted_date: remindAtMoment.format('Do MMMM YYYY'),
      formatted_time: remindAtMoment.format('h:mm A')
    };
    
  } catch (error) {
    console.error('Error parsing reminder with OpenAI:', error);
    if (error.response) {
      console.error('OpenAI API Error:', error.response.data);
    }
    throw error;
  }
}

module.exports = {
  parseReminderMessage
};