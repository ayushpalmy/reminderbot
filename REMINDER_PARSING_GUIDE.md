# Natural Language Reminder Parsing - Implementation Guide

## ✅ What's Implemented

The WhatsApp bot now includes **natural language reminder parsing** functionality:

### Features
- ✅ Parse natural language messages like "remind me to pay electricity bill on 5th every month"
- ✅ Extract reminder text, date/time, and repeat type using OpenAI GPT-4o-mini
- ✅ Automatic user creation with plan_type="free"
- ✅ Save parsed reminders to PostgreSQL database
- ✅ Send WhatsApp confirmation messages
- ✅ Handle parsing errors gracefully
- ✅ IST timezone support (Asia/Kolkata)

### Architecture

```
Incoming WhatsApp Message
  ↓
Parse with OpenAI GPT-4o-mini
  ↓
Extract: reminder_text, remind_at, repeat_type
  ↓
Get/Create User in Database
  ↓
Save Reminder to Database
  ↓
Send WhatsApp Confirmation
```

## 🔑 Required API Keys

You need to add two API keys to `/app/backend/.env`:

### 1. WhatsApp Cloud API Credentials

Get from [Meta for Developers](https://developers.facebook.com/):
```env
WHATSAPP_TOKEN=your_actual_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=your_actual_phone_number_id
```

### 2. OpenAI API Key

Get from [OpenAI Platform](https://platform.openai.com/api-keys):
```env
OPENAI_API_KEY=sk-your_actual_openai_key_here
```

**Note:** Emergent's universal LLM key is optimized for Python SDK. For Node.js implementations, you need your own OpenAI API key.

After updating the keys:
```bash
sudo supervisorctl restart backend
```

## 🧪 Testing

### Test 1: Create Reminder via Test Endpoint (No API keys needed)

```bash
curl -X POST http://localhost:8001/api/test/reminder \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "919876543210",
    "reminder_text": "Pay electricity bill",
    "date_string": "2026-04-05 09:00:00",
    "repeat_type": "monthly"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "phone_number": "919876543210",
    "plan_type": "free"
  },
  "reminder": {
    "id": 1,
    "reminder_text": "Pay electricity bill",
    "remind_at": "2026-04-05T03:30:00.000Z",
    "repeat_type": "monthly"
  }
}
```

### Test 2: Get User Reminders

```bash
curl http://localhost:8001/api/test/reminders/919876543210
```

### Test 3: WhatsApp Message Processing (Requires API keys)

Send a WhatsApp message from your phone to your WhatsApp Business number:
```
remind me to take medicine tonight at 9PM
```

**Expected Flow:**
1. Message received via webhook
2. OpenAI parses the message
3. User auto-created (if new)
4. Reminder saved to database
5. Confirmation sent back: "✅ Reminder set — take medicine on 11th March 2026 at 9:00 PM"

## 📊 Database Verification

### Check Users
```bash
sudo -u postgres psql -d whatsapp_bot_db -c "SELECT * FROM users;"
```

### Check Reminders
```bash
sudo -u postgres psql -d whatsapp_bot_db -c "SELECT * FROM reminders ORDER BY remind_at;"
```

## 🔄 How It Works

### 1. Message Reception
When a user sends a WhatsApp message, Meta sends a webhook POST request to `/api/webhook`.

### 2. OpenAI Parsing
The message is sent to OpenAI GPT-4o-mini with a detailed prompt that:
- Understands current date/time in IST
- Parses relative dates ("tonight", "tomorrow", "5th")
- Extracts reminder text
- Determines repeat frequency
- Returns structured JSON

### 3. User Management
- Checks if user exists in database by phone number
- Creates new user with `plan_type="free"` if not found
- Returns user object

### 4. Reminder Storage
- Saves to `reminders` table with:
  - `user_id` (foreign key)
  - `reminder_text`
  - `remind_at` (timestamp in UTC, converted from IST)
  - `repeat_type` (once/daily/weekly/monthly)
  - `is_done` (false by default)

### 5. WhatsApp Response
Sends confirmation message via WhatsApp Cloud API:
```
✅ Reminder set — [reminder text] on [date] at [time]
```

If parsing fails:
```
Sorry, I didn't understand. Try: Remind me to pay rent on 1st every month
```

## 📁 Code Structure

### Services
- **`services/reminderParser.js`** - OpenAI integration for parsing
- **`services/userService.js`** - User CRUD operations
- **`services/reminderService.js`** - Reminder CRUD operations
- **`services/whatsappService.js`** - WhatsApp message sending

### Routes
- **`routes/webhook.js`** - WhatsApp webhook handler (main logic)
- **`routes/test.js`** - Test endpoints for development

## 🎯 Example Messages

The bot can understand various formats:

| User Message | Parsed Reminder |
|-------------|----------------|
| "remind me to pay electricity bill on 5th every month" | Monthly reminder on 5th at 9:00 AM |
| "remind me to take medicine tonight at 9PM" | One-time reminder today at 9:00 PM |
| "remind me to call mom tomorrow at 3pm" | One-time reminder tomorrow at 3:00 PM |
| "remind me to workout every day at 6am" | Daily reminder at 6:00 AM |
| "remind me to submit report on March 15th" | One-time reminder on March 15th at 9:00 AM |

## 🚨 Error Handling

### OpenAI API Errors
- Network issues → Sends error message to user
- Invalid API key → Logged, user gets error message
- Rate limits → Logged, user gets error message

### WhatsApp API Errors
- Invalid credentials → Logged (doesn't crash webhook)
- Message send fails → Logged (reminder still saved)

### Database Errors
- Connection issues → Returns 500 error
- Constraint violations → Logged and handled

## 🔍 Monitoring & Logs

### View Logs
```bash
# Application logs
tail -f /var/log/supervisor/backend.out.log

# Error logs  
tail -f /var/log/supervisor/backend.err.log
```

### Key Log Markers
- `[PROCESSING]` - Reminder processing steps
- `[OPENAI RESPONSE]` - Raw OpenAI API response
- `[WHATSAPP]` - WhatsApp message sending
- `[PROCESSING ERROR]` - Errors during processing

## 📈 Next Steps

The foundation is complete. You can now add:

1. **Reminder Scheduler** - Background job to check `reminders` table and send messages when `remind_at` time arrives
2. **Subscription Plans** - Limit reminders based on user's `plan_type`
3. **Reminder Management** - Commands like "list my reminders", "delete reminder", "mark as done"
4. **Enhanced NLP** - Support more date formats, timezones, smart recurrence
5. **Analytics** - Track reminder creation, completion rates, user engagement

## 🛠️ Troubleshooting

### Issue: Webhook not receiving messages
- Check Meta dashboard webhook configuration
- Verify webhook URL is correct
- Check verification token matches

### Issue: OpenAI parsing fails
- Verify OPENAI_API_KEY is set correctly
- Check OpenAI account has credits
- Review error logs for specific error

### Issue: WhatsApp messages not sending
- Verify WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID
- Check WhatsApp Business account status
- Verify phone number is registered with WhatsApp

### Issue: Database errors
- Check PostgreSQL is running: `sudo service postgresql status`
- Verify database connection: `sudo -u postgres psql -d whatsapp_bot_db`
- Check backend logs for specific error
