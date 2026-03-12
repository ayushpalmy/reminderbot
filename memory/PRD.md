# PRD.md - WhatsApp & Telegram Reminder Bot

## Original Problem Statement
Build a backend for a WhatsApp/Telegram reminder bot using Node.js and Express with the following features:
- Natural language parsing for reminders using Google Gemini
- Recurring reminders (daily, weekly, monthly)
- User commands: MY REMINDERS, DONE, SNOOZE, RESCHEDULE, DELETE, UPGRADE, HELP
- Free plan limit of 3 active reminders
- Razorpay payment integration for plan upgrades
- Multi-platform support (WhatsApp and Telegram)
- Admin dashboard for monitoring

## User Personas
1. **Free Users**: Can set up to 3 reminders, receive notifications via WhatsApp or Telegram
2. **Personal Plan Users**: Unlimited reminders for ₹49/month
3. **Admin**: Access to dashboard showing user stats and recent activity

## Core Requirements
1. ✅ Node.js/Express backend with MongoDB
2. ✅ WhatsApp webhook integration
3. ✅ Telegram webhook integration
4. ✅ Natural language parsing via Google Gemini
5. ✅ Recurring reminders (daily, weekly, monthly)
6. ✅ User command handling
7. ✅ Free plan limits
8. ✅ Razorpay payment integration
9. ✅ Admin dashboard
10. ✅ Deployment-ready (render.yaml, health endpoints, keepalive)

## What's Been Implemented (March 2026)

### Backend Infrastructure
- Express.js server on port 8001
- MongoDB database (migrated from PostgreSQL)
- CORS enabled
- Request logging middleware
- Health check endpoints (`/health`, `/api/health`)

### WhatsApp Integration
- Webhook verification: `GET /api/webhook`
- Message handling: `POST /api/webhook`
- All commands supported

### Telegram Integration (Completed March 12, 2026)
- Webhook handler: `POST /api/telegram/webhook`
- Setup helper: `POST /api/telegram/setup-webhook`
- Webhook info: `GET /api/telegram/webhook-info`
- All commands supported (HELP, /START, MY REMINDERS, DONE, SNOOZE, RESCHEDULE, DELETE, UPGRADE)
- Full feature parity with WhatsApp

### Reminder System
- Natural language parsing with Gemini
- Recurring reminders (daily, weekly, monthly)
- Cron job runs every minute
- Sends to both WhatsApp and Telegram users

### Payment Integration
- Razorpay payment link generation
- Webhook for payment confirmation
- Plan upgrade flow

### Admin Dashboard
- Password-protected at `/api/admin`
- Shows user stats (total, free, paid, WhatsApp, Telegram)
- Shows active reminders and reminders sent today
- Lists recent users with platform identification

## Technical Architecture

### Database Schema (MongoDB)
```
users: {
  _id: ObjectId,
  phone_number: String (nullable),
  telegram_chat_id: String (nullable),
  plan_type: String ('free' | 'personal'),
  created_at: Date
}

reminders: {
  _id: ObjectId,
  user_id: String,
  reminder_text: String,
  remind_at: Date,
  repeat_type: String ('once' | 'daily' | 'weekly' | 'monthly'),
  is_done: Boolean,
  last_sent_at: Date,
  created_at: Date
}

subscriptions: {
  _id: ObjectId,
  user_id: String,
  plan: String,
  status: String,
  started_at: Date,
  expires_at: Date,
  payment_id: String
}
```

### API Endpoints
- `GET /api` - API info
- `GET /api/health` - Health check
- `GET /api/webhook` - WhatsApp verification
- `POST /api/webhook` - WhatsApp messages
- `POST /api/telegram/webhook` - Telegram messages
- `POST /api/telegram/setup-webhook` - Set Telegram webhook
- `GET /api/telegram/webhook-info` - Get webhook status
- `POST /api/razorpay/webhook` - Payment confirmation
- `GET /api/admin` - Admin dashboard (Basic Auth)

## P0/P1/P2 Features

### P0 (Critical) - All Complete ✅
- [x] WhatsApp webhook
- [x] Telegram webhook
- [x] Reminder parsing
- [x] Reminder scheduling
- [x] User commands
- [x] Database persistence

### P1 (Important) - All Complete ✅
- [x] Free plan limits
- [x] Payment integration
- [x] Admin dashboard
- [x] Recurring reminders

### P2 (Nice to Have) - Pending
- [ ] User timezone settings
- [ ] Multi-language support
- [ ] Reminder categories/tags
- [ ] Reminder sharing
- [ ] SMS fallback

## External Dependencies (Require API Keys)
1. **Google Gemini** - For natural language parsing
2. **Razorpay** - For payment processing
3. **WhatsApp Cloud API** - For WhatsApp messaging
4. **Telegram Bot API** - For Telegram messaging

## Next Steps
1. User to provide API keys for full functionality
2. Set up Telegram bot webhook with BotFather
3. Configure WhatsApp webhook in Meta Business Suite
4. Deploy to production (Render.com ready)
