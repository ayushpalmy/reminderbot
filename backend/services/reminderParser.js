const Groq = require('groq-sdk');
const moment = require('moment-timezone');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

/**
 * Parse a natural language reminder message using Groq API
 * @param {string} message - The user's message
 * @param {boolean} extractTextOnly - If true, only extract reminder text without time
 * @returns {Promise<Object>} - Parsed reminder data or null if not a reminder
 */
async function parseReminderMessage(message, extractTextOnly = false) {
  try {
    const currentDateTime = moment.tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const currentDay = moment.tz(TIMEZONE).format('dddd');
    const currentMonth = moment.tz(TIMEZONE).format('MMMM');
    const currentYear = moment.tz(TIMEZONE).format('YYYY');
    
    let systemPrompt;
    
    if (extractTextOnly) {
      // Only extract the reminder text/task
      systemPrompt = `You are a reminder text extractor. Extract ONLY the task/activity the user wants to be reminded about.

User message: ${message}

Extract what they want to be reminded about. Examples:
- "remind me to call mom" → "call mom"
- "I want to laugh" → "laugh"
- "buy groceries tomorrow" → "buy groceries"
- "take medicine" → "take medicine"

Respond ONLY with valid JSON:
{
  "is_reminder": true,
  "reminder_text": "extracted text here"
}

OR if not a reminder:
{
  "is_reminder": false
}`;
    } else {
      // Full parsing with time
      systemPrompt = `You are a reminder parsing assistant. Your job is to extract reminder information from user messages.

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
- For single numbers without AM/PM (like "5", "9"), assume PM if between 1-11, else use 24-hour format
- Understand short forms: "9pm" = 9:00 PM, "daily" = every day, "monday" = next Monday

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
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: systemPrompt
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });
    
    const content = chatCompletion.choices[0]?.message?.content?.trim();
    
    if (!content) {
      console.error('[GROQ] No response content received');
      return null;
    }
    
    console.log('\n[GROQ RESPONSE]:', content);
    
    // Extract JSON from response (handle potential markdown code blocks)
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
    
    // If extractTextOnly, return just the reminder text
    if (extractTextOnly) {
      return {
        reminder_text: parsed.reminder_text
      };
    }
    
    // Validate and convert remind_at to Date object
    const remindAtMoment = moment.tz(parsed.remind_at, TIMEZONE);
    if (!remindAtMoment.isValid()) {
      console.error('[GROQ] Invalid date format:', parsed.remind_at);
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
    console.error('[GROQ] Error parsing reminder:', error);
    if (error.response) {
      console.error('[GROQ] API Error:', error.response);
    }
    throw error;
  }
}

/**
 * Smart time parser - handles short forms like "5", "9pm", "daily"
 * @param {string} timeText - User's time input
 * @param {string} reminderText - The reminder text for context
 * @returns {Promise<Object>} - Parsed time data
 */
async function parseTimeInput(timeText, reminderText) {
  const currentDateTime = moment.tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
  
  // Handle single numbers (assume PM for 1-11, 24-hour for 12+)
  const singleNumberMatch = timeText.match(/^(\d{1,2})$/);
  if (singleNumberMatch) {
    const hour = parseInt(singleNumberMatch[1]);
    if (hour >= 1 && hour <= 11) {
      timeText = `${hour}PM`;
    } else if (hour === 12) {
      timeText = `${hour}PM`;
    } else {
      timeText = `${hour}:00`;
    }
  }
  
  // Parse with Groq
  return await parseReminderMessage(`remind me to ${reminderText} at ${timeText}`);
}

module.exports = {
  parseReminderMessage,
  parseTimeInput
};
