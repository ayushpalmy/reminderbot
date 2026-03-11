# WhatsApp Reminder Bot Backend

A Node.js/Express backend for a WhatsApp reminder bot using Meta's WhatsApp Cloud API and PostgreSQL.

## Features

- ✅ WhatsApp Cloud API integration
- ✅ Webhook verification endpoint (GET)
- ✅ Webhook receiver for incoming messages (POST)
- ✅ **Natural language reminder parsing with OpenAI GPT-4o-mini**
- ✅ **Automatic user creation and management**
- ✅ **Reminder storage with repeat types (once/daily/weekly/monthly)**
- ✅ **WhatsApp message sending for confirmations**
- ✅ **IST timezone support (Asia/Kolkata)**
- ✅ PostgreSQL database with proper schema
- ✅ User management
- ✅ Reminder storage
- ✅ Subscription tracking

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL 15
- **API**: Meta WhatsApp Cloud API

## Project Structure

```
backend/
├── server.js              # Main Express application
├── config/
│   └── db.js             # PostgreSQL connection and initialization
├── routes/
│   ├── webhook.js        # WhatsApp webhook endpoints (main logic)
│   └── test.js           # Test endpoints for development
├── services/
│   ├── reminderParser.js # OpenAI integration for parsing
│   ├── userService.js    # User management (CRUD)
│   ├── reminderService.js # Reminder management (CRUD)
│   └── whatsappService.js # WhatsApp message sending
├── start.sh              # Startup script with env loading
├── package.json          # Node.js dependencies
└── .env                  # Environment variables
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  plan_type VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Reminders Table
```sql
CREATE TABLE reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  reminder_text TEXT NOT NULL,
  remind_at TIMESTAMP NOT NULL,
  repeat_type VARCHAR(20) DEFAULT 'once',
  is_done BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Subscriptions Table
```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);
```

## API Endpoints

### Root Endpoint
```
GET /api
```
Returns API information and available endpoints.

### Health Check
```
GET /api/health
```
Returns server health status.

### Webhook Verification (Meta)
```
GET /api/webhook?hub.mode=subscribe&hub.verify_token=<YOUR_TOKEN>&hub.challenge=<CHALLENGE>
```
Verifies webhook with Meta's WhatsApp Cloud API.

**Parameters:**
- `hub.mode`: Must be "subscribe"
- `hub.verify_token`: Must match `WHATSAPP_VERIFY_TOKEN` in .env
- `hub.challenge`: Challenge string from Meta

**Response:**
Returns the challenge string if verification succeeds.

### Webhook Receiver
```
POST /api/webhook
```
Receives incoming WhatsApp messages from Meta.

**Request Body:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "PHONE_NUMBER",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "messages": [{
          "from": "SENDER_PHONE_NUMBER",
          "id": "MESSAGE_ID",
          "timestamp": "TIMESTAMP",
          "text": {
            "body": "MESSAGE_TEXT"
          },
          "type": "text"
        }]
      }
    }]
  }]
}
```

**Response:**
```json
{
  "status": "received"
}
```

## Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
PORT=8001
DATABASE_URL=postgresql://whatsapp_bot:whatsapp_bot_pass@localhost:5432/whatsapp_bot_db

# WhatsApp Cloud API Credentials (Update these)
WHATSAPP_TOKEN=your_whatsapp_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here

# Webhook Verification Token
WHATSAPP_VERIFY_TOKEN=verify_token_8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o

# OpenAI API Key (Get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=your_openai_api_key_here

# Timezone for reminders
TIMEZONE=Asia/Kolkata

# CORS Settings
CORS_ORIGINS=*
```

## Setup Instructions

### 1. Install Dependencies
```bash
cd /app/backend
yarn install
```

### 2. Set Up PostgreSQL
PostgreSQL is already installed and running. The database `whatsapp_bot_db` and user `whatsapp_bot` are created automatically.

### 3. Configure WhatsApp Cloud API

To get your WhatsApp credentials:

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app or select an existing one
3. Add "WhatsApp" product to your app
4. Navigate to WhatsApp > API Setup
5. Copy the **Access Token** and **Phone Number ID**
6. Update `.env` file with these values:
   ```env
   WHATSAPP_TOKEN=your_actual_access_token
   WHATSAPP_PHONE_NUMBER_ID=your_actual_phone_number_id
   ```

### 4. Configure Webhook in Meta Dashboard

1. In your Meta app, go to WhatsApp > Configuration
2. Click "Edit" next to Webhook
3. Enter your callback URL:
   ```
   https://your-app-domain.preview.emergentagent.com/api/webhook
   ```
4. Enter the verify token from your `.env` file:
   ```
   verify_token_8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o
   ```
5. Click "Verify and Save"
6. Subscribe to webhook fields: `messages`

### 5. Start the Server

The server is managed by supervisor and starts automatically.

To manually restart:
```bash
sudo supervisorctl restart backend
```

To check status:
```bash
sudo supervisorctl status backend
```

To view logs:
```bash
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/backend.err.log
```

## Testing

### Test Webhook Verification
```bash
curl "http://localhost:8001/api/webhook?hub.mode=subscribe&hub.verify_token=verify_token_8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o&hub.challenge=test_challenge"
```

Expected output: `test_challenge`

### Test Incoming Message
```bash
curl -X POST http://localhost:8001/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "15551234567",
            "phone_number_id": "PHONE_NUMBER_ID"
          },
          "messages": [{
            "from": "919876543210",
            "id": "wamid.test123",
            "timestamp": "1234567890",
            "text": {
              "body": "Test reminder message"
            },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

Expected output: `{"status":"received"}`

Check logs to see the parsed message:
```bash
tail -n 30 /var/log/supervisor/backend.out.log
```

## Database Management

### Connect to PostgreSQL
```bash
sudo -u postgres psql -d whatsapp_bot_db
```

### View Tables
```sql
\dt
```

### View Table Schema
```sql
\d users
\d reminders
\d subscriptions
```

### Query Examples
```sql
-- View all users
SELECT * FROM users;

-- View all reminders
SELECT * FROM reminders;

-- View active subscriptions
SELECT * FROM subscriptions WHERE status = 'active';
```

## Current Implementation Status

✅ **Completed:**
- PostgreSQL database setup
- Database schema and indexes
- Express server with CORS
- Webhook verification endpoint (GET)
- Webhook receiver endpoint (POST)
- **Natural language reminder parsing with OpenAI GPT-4o-mini**
- **Automatic user creation (plan_type="free")**
- **Reminder extraction (text, date/time, repeat type)**
- **IST timezone handling (Asia/Kolkata)**
- **WhatsApp message sending (confirmations & errors)**
- **Test endpoints for development**
- Message parsing and logging
- Environment variable configuration
- Supervisor service management

⏳ **Not Yet Implemented:**
- Reminder scheduling/trigger system (background job to send reminders at scheduled time)
- Subscription plan enforcement
- Reminder management commands (list, delete, mark done)

## Next Steps

To implement the reminder functionality, you'll need to add:

1. **Message Processing**: Parse user commands (e.g., "remind me to X at Y")
2. **User Management**: Register new users automatically
3. **Reminder Creation**: Store reminders in the database
4. **Reminder Scheduler**: Background job to check and send reminders
5. **WhatsApp Messaging**: Function to send messages back to users
6. **Command Handlers**: Handle different user commands

## Notes

- The server runs on port `8001` and binds to `0.0.0.0`
- All API routes must have `/api` prefix for proper Kubernetes ingress routing
- Frontend is disabled as per requirements
- MongoDB is disabled (replaced by PostgreSQL)
- Environment variables are loaded via the `start.sh` script

## Support

For issues or questions, check:
- Backend logs: `/var/log/supervisor/backend.out.log` and `/var/log/supervisor/backend.err.log`
- PostgreSQL logs: `/var/log/postgresql.err.log`
- Supervisor status: `sudo supervisorctl status`
