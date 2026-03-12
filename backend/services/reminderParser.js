const { GoogleGenerativeAI } = require('@google/generative-ai');
const moment = require('moment-timezone');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

/**
 * Parse a natural language reminder message using Google Gemini
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
}

User message: ${message}`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const content = response.text().trim();
    
    console.log('\n[GEMINI RESPONSE]:', content);
    
    // Extract JSON from response (Gemini sometimes adds markdown code blocks)
    let jsonContent = content;
    if (content.includes('```json')) {
      jsonContent = content.match(/```json\n([\s\S]*?)\n```/)?.[1] || content;
    } else if (content.includes('```')) {
      jsonContent = content.match(/```\n([\s\S]*?)\n```/)?.[1] || content;
    }
    
    // Parse the JSON response
    const parsed = JSON.parse(jsonContent.trim());
    
    if (!parsed.is_reminder) {
      return null;
    }
    
    // Validate and convert remind_at to Date object
    const remindAtMoment = moment.tz(parsed.remind_at, TIMEZONE);
    if (!remindAtMoment.isValid()) {
      console.error('Invalid date format from Gemini:', parsed.remind_at);
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
    console.error('Error parsing reminder with Gemini:', error);
    if (error.response) {
      console.error('Gemini API Error:', error.response);
    }
    throw error;
  }
}

module.exports = {
  parseReminderMessage
};