/**
 * Multilingual response templates
 * Supports: English, Hindi, Hinglish
 */

const MESSAGES = {
  // When should I remind you?
  ask_time: {
    english: "When should I remind you? Example: today 6PM, tomorrow 9AM, every day 8PM",
    hindi: "मैं आपको कब याद दिलाऊं? उदाहरण: आज शाम 6 बजे, कल सुबह 9 बजे, हर दिन रात 8 बजे",
    hinglish: "Main aapko kab yaad dilaun? Example: aaj 6PM, kal 9AM, har din 8PM"
  },
  
  // Reminder set confirmation
  reminder_set: {
    english: "✅ Reminder set — {text} on {date} at {time}{repeat}",
    hindi: "✅ रिमाइंडर सेट हो गया — {text}, {date} को {time} बजे{repeat}",
    hinglish: "✅ Reminder set ho gaya — {text}, {date} ko {time} baje{repeat}"
  },
  
  // Free limit reached
  limit_reached: {
    english: "⚠️ You've used all 3 free reminders.\n\nUpgrade to Personal Plan — ₹49/month for unlimited reminders.\n\n💳 Pay here: {link}",
    hindi: "⚠️ आपने सभी 3 मुफ्त रिमाइंडर उपयोग कर लिए हैं।\n\nPersonal Plan में अपग्रेड करें — असीमित रिमाइंडर के लिए ₹49/महीना।\n\n💳 यहाँ भुगतान करें: {link}",
    hinglish: "⚠️ Aapne saare 3 free reminders use kar liye.\n\nPersonal Plan mein upgrade karein — unlimited reminders ke liye ₹49/month.\n\n💳 Yahan payment karein: {link}"
  },
  
  // Ask AM or PM
  ask_am_pm: {
    english: "⏰ {hour} AM or {hour} PM?",
    hindi: "⏰ {hour} सुबह या {hour} शाम?",
    hinglish: "⏰ {hour} AM ya {hour} PM?"
  },
  
  // Upgrade link message
  upgrade_message: {
    english: "💳 Upgrade to Personal Plan\n\n✨ Unlimited reminders\n💰 ₹49/month\n\nPay here: {link}",
    hindi: "💳 Personal Plan में अपग्रेड करें\n\n✨ असीमित रिमाइंडर\n💰 ₹49/महीना\n\nयहाँ भुगतान करें: {link}",
    hinglish: "💳 Personal Plan mein upgrade karein\n\n✨ Unlimited reminders\n💰 ₹49/month\n\nYahan payment karein: {link}"
  },
  
  // Repeat types
  repeat_daily: {
    english: " every day",
    hindi: " हर दिन",
    hinglish: " har din"
  },
  repeat_weekly: {
    english: " every week",
    hindi: " हर हफ्ते",
    hinglish: " har hafte"
  },
  repeat_monthly: {
    english: " every month",
    hindi: " हर महीने",
    hinglish: " har mahine"
  }
};

/**
 * Get message in user's language
 * @param {string} key - Message key
 * @param {string} language - 'english', 'hindi', or 'hinglish'
 * @param {Object} replacements - Key-value pairs to replace in message
 * @returns {string}
 */
function getMessage(key, language = 'english', replacements = {}) {
  const lang = ['hindi', 'hinglish', 'english'].includes(language) ? language : 'english';
  let message = MESSAGES[key][lang] || MESSAGES[key]['english'];
  
  // Replace placeholders
  Object.keys(replacements).forEach(k => {
    message = message.replace(new RegExp(`{${k}}`, 'g'), replacements[k]);
  });
  
  return message;
}

module.exports = {
  getMessage,
  MESSAGES
};
