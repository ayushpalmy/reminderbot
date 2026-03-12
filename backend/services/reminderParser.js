const Groq = require('groq-sdk');
const moment = require('moment-timezone');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

/**
 * Detect language of message
 * @param {string} message 
 * @returns {Promise<string>} - 'hindi', 'hinglish', or 'english'
 */
async function detectLanguage(message) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{
        role: 'user',
        content: `Detect the language of this text. Reply ONLY with one word: "hindi" (if mostly Hindi/Devanagari), "hinglish" (if mix of Hindi and English using Roman script), or "english" (if English).

Text: ${message}

Language:`
      }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 10
    });
    
    const language = chatCompletion.choices[0]?.message?.content?.trim().toLowerCase();
    console.log(`[LANGUAGE] Detected: ${language} for message: ${message}`);
    return language || 'english';
  } catch (error) {
    console.error('[LANGUAGE] Detection error:', error);
    return 'english';
  }
}

/**
 * Parse a natural language reminder message using Groq API (with multilingual support)
 * @param {string} message - The user's message
 * @param {boolean} extractTextOnly - If true, only extract reminder text without time
 * @param {string} language - Detected language (hindi/hinglish/english)
 * @returns {Promise<Object>} - Parsed reminder data or null if not a reminder
 */
async function parseReminderMessage(message, extractTextOnly = false, language = 'english') {
  try {
    const currentDateTime = moment.tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    const currentDay = moment.tz(TIMEZONE).format('dddd');
    const currentMonth = moment.tz(TIMEZONE).format('MMMM');
    const currentYear = moment.tz(TIMEZONE).format('YYYY');
    
    let systemPrompt;
    
    if (extractTextOnly) {
      // Only extract the reminder text/task
      systemPrompt = `You are a multilingual reminder text extractor. The user message can be in Hindi, Hinglish (Hindi+English mix), or English.

User message: ${message}

Extract ONLY the task/activity they want to be reminded about. Handle all three languages:

Examples:
- "remind me to call mom" → "call mom"
- "mujhe yaad dilao medicine lena" → "medicine lena"
- "har din exercise karna" → "exercise karna"
- "bijli ka bill pay karo" → "bijli ka bill pay"
- "I want to laugh" → "laugh"

Respond ONLY with valid JSON:
{
  "is_reminder": true,
  "reminder_text": "extracted text here (keep in original language)",
  "detected_language": "hindi|hinglish|english"
}

OR if not a reminder:
{
  "is_reminder": false
}`;
    } else {
      // Full parsing with time - multilingual
      systemPrompt = `You are a multilingual reminder parsing assistant supporting Hindi, Hinglish (Hindi+English mix), and English.

Current date and time in IST: ${currentDateTime} (${currentDay}, ${currentMonth} ${currentYear})
Timezone: ${TIMEZONE}

User message (can be Hindi/Hinglish/English): ${message}

Extract:
1. reminder_text: What they want to be reminded about (keep in original language)
2. remind_at: Exact date and time in "YYYY-MM-DD HH:mm:ss" format (IST)
3. repeat_type: "once", "daily", "weekly", or "monthly"
4. detected_language: "hindi", "hinglish", or "english"

Understand Hindi/Hinglish time words:
- "kal" = tomorrow
- "aaj" = today
- "subah" = morning (9 AM)
- "dopahar" = afternoon (2 PM)
- "shaam" = evening (6 PM)
- "raat" = night (9 PM)
- "har din" = daily
- "har hafte" = weekly
- "har mahine" = monthly
- "baje" = o'clock
- "tarikh" = date

Rules:
- If time not specified, use 09:00:00
- "tonight" or "raat ko" = today at 21:00:00
- "tomorrow" or "kal" = next day
- "every day" or "har din" = daily
- "every week" or "har hafte" = weekly
- "every month" or "har mahine" = monthly
- For numbers like "5", "9" without AM/PM, return "AMBIGUOUS_TIME" as remind_at
- For 24hr format (14, 15, etc), use as is

Respond with valid JSON:
{
  "is_reminder": true,
  "reminder_text": "text in original language",
  "remind_at": "YYYY-MM-DD HH:mm:ss" OR "AMBIGUOUS_TIME",
  "repeat_type": "once|daily|weekly|monthly",
  "detected_language": "hindi|hinglish|english",
  "ambiguous_hour": 5 (only if remind_at is AMBIGUOUS_TIME)
}

OR if not a reminder:
{
  "is_reminder": false
}`;
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [{
        role: 'user',
        content: systemPrompt
      }],
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
    
    // Extract JSON from response
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
    
    // If extractTextOnly, return just the reminder text with language
    if (extractTextOnly) {
      return {
        reminder_text: parsed.reminder_text,
        detected_language: parsed.detected_language || language
      };
    }
    
    // Check if time is ambiguous
    if (parsed.remind_at === 'AMBIGUOUS_TIME') {
      return {
        ambiguous_time: true,
        ambiguous_hour: parsed.ambiguous_hour,
        reminder_text: parsed.reminder_text,
        repeat_type: parsed.repeat_type,
        detected_language: parsed.detected_language || language
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
      formatted_time: remindAtMoment.format('h:mm A'),
      detected_language: parsed.detected_language || language
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
 * Smart time parser - handles short forms and multilingual
 * @param {string} timeText - User's time input
 * @param {string} reminderText - The reminder text for context
 * @param {string} language - Detected language
 * @returns {Promise<Object>} - Parsed time data
 */
async function parseTimeInput(timeText, reminderText, language = 'english') {
  // Check for ambiguous single digit times (1-12 without AM/PM)
  const singleNumberMatch = timeText.match(/^(\d{1,2})$/);
  if (singleNumberMatch) {
    const hour = parseInt(singleNumberMatch[1]);
    
    // For times 13-23, use 24hr format
    if (hour >= 13 && hour <= 23) {
      timeText = `${hour}:00`;
    } 
    // For times 1-12, it's ambiguous - return special marker
    else if (hour >= 1 && hour <= 12) {
      return {
        ambiguous_time: true,
        ambiguous_hour: hour,
        reminder_text: reminderText
      };
    }
  }
  
  // Parse with Groq (multilingual)
  return await parseReminderMessage(`remind me to ${reminderText} at ${timeText}`, false, language);
}

/**
 * Resolve ambiguous time with AM/PM choice
 * @param {number} hour - The hour (1-12)
 * @param {string} ampm - 'AM' or 'PM'
 * @param {string} reminderText 
 * @param {string} repeatType 
 * @returns {Object}
 */
function resolveAmbiguousTime(hour, ampm, reminderText, repeatType) {
  const now = moment.tz(TIMEZONE);
  let targetTime = moment.tz(TIMEZONE);
  
  // Set the time
  if (ampm.toUpperCase() === 'AM') {
    targetTime.hour(hour === 12 ? 0 : hour);
  } else {
    targetTime.hour(hour === 12 ? 12 : hour + 12);
  }
  targetTime.minute(0).second(0);
  
  // If time has passed today and it's a one-time reminder, set for tomorrow
  if (repeatType === 'once' && targetTime.isBefore(now)) {
    targetTime.add(1, 'day');
  }
  
  return {
    reminder_text: reminderText,
    remind_at: targetTime.toDate(),
    repeat_type: repeatType,
    formatted_date: targetTime.format('Do MMMM YYYY'),
    formatted_time: targetTime.format('h:mm A')
  };
}

module.exports = {
  parseReminderMessage,
  parseTimeInput,
  resolveAmbiguousTime,
  detectLanguage
};
