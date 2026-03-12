# WhatsApp Bot - Quick Reference

## 🔑 Important Credentials & URLs

### Your Webhook URL (for Meta Dashboard)
```
https://gemini-reminder-bot.preview.emergentagent.com/api/webhook
```

### Your Webhook Verification Token
```
verify_token_8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o
```

## 📝 What You Need to Do Next

### 1. Get WhatsApp Credentials from Meta

1. Visit: https://developers.facebook.com/
2. Create/Select an app
3. Add "WhatsApp" product
4. Go to: WhatsApp > API Setup
5. Copy these values:
   - **Access Token**
   - **Phone Number ID**

### 2. Update Environment Variables

Edit `/app/backend/.env` and replace:
```env
WHATSAPP_TOKEN=your_whatsapp_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
```

With your actual values from Meta.

Then restart the backend:
```bash
sudo supervisorctl restart backend
```

### 3. Configure Webhook in Meta Dashboard

1. Go to: WhatsApp > Configuration
2. Click "Edit" next to Webhook
3. Enter Callback URL:
   ```
   https://gemini-reminder-bot.preview.emergentagent.com/api/webhook
   ```
4. Enter Verify Token:
   ```
   verify_token_8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o
   ```
5. Click "Verify and Save"
6. Subscribe to: `messages`

## 🧪 Testing Commands

### Test API
```bash
curl https://gemini-reminder-bot.preview.emergentagent.com/api
```

### Test Webhook Verification
```bash
curl "https://gemini-reminder-bot.preview.emergentagent.com/api/webhook?hub.mode=subscribe&hub.verify_token=verify_token_8f9a2b3c4d5e6f7g8h9i0j1k2l3m4n5o&hub.challenge=test_123"
```

### View Logs
```bash
# Backend logs
tail -f /var/log/supervisor/backend.out.log

# Error logs
tail -f /var/log/supervisor/backend.err.log
```

### Check Services
```bash
# Backend status
sudo supervisorctl status backend

# PostgreSQL status
sudo service postgresql status
```

## 🗄️ Database Access

### Connect to Database
```bash
sudo -u postgres psql -d whatsapp_bot_db
```

### Quick Queries
```sql
-- View all tables
\dt

-- View users
SELECT * FROM users;

-- View reminders
SELECT * FROM reminders;

-- View subscriptions
SELECT * FROM subscriptions;

-- Exit
\q
```

## 📊 Current Status

✅ PostgreSQL database running
✅ Express backend running on port 8001
✅ Webhook verification working
✅ Incoming message logging working
✅ Database tables created with proper schema

⏳ **Not Yet Implemented:**
- Reminder scheduling logic
- Message sending to WhatsApp
- User command processing
- Automatic reminder triggers

## 🔧 Common Commands

### Restart Backend
```bash
sudo supervisorctl restart backend
```

### View Backend Status
```bash
sudo supervisorctl status
```

### Install New Dependencies
```bash
cd /app/backend
yarn add <package-name>
sudo supervisorctl restart backend
```

### Edit Environment Variables
```bash
# Edit the file
nano /app/backend/.env

# Restart to apply changes
sudo supervisorctl restart backend
```
