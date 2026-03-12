# WhatsApp Reminder Bot

A fully-featured WhatsApp bot for setting and managing reminders with natural language processing, payment integration, and an admin dashboard.

## 🌟 Features

- 🤖 **Natural Language Processing** - Set reminders naturally: "remind me to pay bills tomorrow at 6pm"
- 📅 **Recurring Reminders** - Daily, weekly, and monthly reminders
- 💬 **Smart Commands** - DONE, SNOOZE, RESCHEDULE, DELETE, MY REMINDERS
- 💳 **Payment Integration** - Razorpay payment for plan upgrades (₹49/month)
- 📊 **Admin Dashboard** - Monitor users, reminders, and stats
- 🔔 **Auto Scheduling** - Cron job sends reminders automatically
- 🎨 **Free & Paid Plans** - Free (3 reminders) / Personal (unlimited)

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- PostgreSQL 15+
- WhatsApp Business Account
- Google Gemini API Key (for NLP)
- Razorpay Account (for payments)

### Local Development

1. **Clone Repository**
```bash
git clone https://github.com/yourusername/whatsapp-reminder-bot.git
cd whatsapp-reminder-bot
```

2. **Install Dependencies**
```bash
cd backend
yarn install
```

3. **Set Up PostgreSQL**
```bash
sudo service postgresql start
sudo -u postgres psql
CREATE DATABASE whatsapp_bot_db;
CREATE USER whatsapp_bot WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE whatsapp_bot_db TO whatsapp_bot;
\q
```

4. **Configure Environment**
```bash
cp .env.example .env
nano .env
```

Fill in your API keys:
- `WHATSAPP_TOKEN` - From Meta for Developers
- `GEMINI_API_KEY` - From Google AI Studio
- `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET` - From Razorpay Dashboard
- `DATABASE_URL` - Your PostgreSQL connection string
- `ADMIN_PASSWORD` - Strong password for admin dashboard

5. **Start Server**
```bash
node server.js
```

Server starts on `http://localhost:8001`

### Deploy to Render

See [DEPLOYMENT.md](/app/DEPLOYMENT.md) for detailed deployment instructions.

**Quick Deploy:**
1. Fork this repository
2. Connect to [Render](https://render.com)
3. Create new Blueprint
4. Add environment variables
5. Done! ✅

## 📱 WhatsApp Commands

### For Users
- **Set Reminder:** Just type naturally
  - "remind me to call mom tomorrow at 6pm"
  - "remind me to take medicine every day at 9am"
  - "remind me to pay rent on 1st every month"

- **MY REMINDERS** - View all active reminders
- **DONE** - Mark last reminder as complete
- **SNOOZE** - Postpone reminder by 2 hours
- **RESCHEDULE** - Change reminder time
- **DELETE [number]** - Delete specific reminder
- **UPGRADE** - Get payment link for Personal plan
- **HELP** - Show command menu

### Plans
- **Free Plan:** 3 active reminders
- **Personal Plan:** ₹49/month, unlimited reminders

## 🎯 Admin Dashboard

Access at `/admin` with password authentication.

**Displays:**
- Total users registered
- Free vs Paid plan distribution
- Active reminders count
- Reminders sent today
- Last 10 users who joined

**URL:** `https://your-app.onrender.com/admin`

## 🔧 API Endpoints

### Public Endpoints
- `GET /health` - Health check
- `GET /api/webhook` - WhatsApp webhook verification
- `POST /api/webhook` - Receive WhatsApp messages
- `POST /api/razorpay/webhook` - Payment confirmations

### Admin Endpoints
- `GET /admin` - Admin dashboard (password protected)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│              WhatsApp User                   │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│         WhatsApp Cloud API (Meta)           │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│          Webhook Handler (Express)          │
│  • Parse messages                            │
│  • Command detection                         │
│  • User management                           │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│       Google Gemini API (NLP)               │
│  • Parse natural language                    │
│  • Extract reminder details                  │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│         PostgreSQL Database                  │
│  • Users table                               │
│  • Reminders table                           │
│  • Subscriptions table                       │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│        Cron Scheduler (node-cron)           │
│  • Runs every minute                         │
│  • Checks pending reminders                  │
│  • Sends via WhatsApp                        │
│  • Updates next occurrence                   │
└─────────────────────────────────────────────┘
```

## 🗄️ Database Schema

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
  user_id INTEGER REFERENCES users(id),
  reminder_text TEXT NOT NULL,
  remind_at TIMESTAMP NOT NULL,
  repeat_type VARCHAR(20) DEFAULT 'once',
  is_done BOOLEAN DEFAULT false,
  last_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Subscriptions Table
```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);
```

## 📦 Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL
- **NLP:** Groq API (llama-3.3-70b-versatile)
- **Payments:** Razorpay
- **Messaging:** WhatsApp Cloud API (Meta)
- **Scheduling:** node-cron
- **Deployment:** Render.com

## 🔐 Security

- Password-protected admin dashboard
- Webhook signature verification (Razorpay)
- WhatsApp token authentication
- Environment variable based configuration
- SQL injection prevention (parameterized queries)
- HTTPS required in production

## 📚 Documentation

- [DEPLOYMENT.md](/app/DEPLOYMENT.md) - Render deployment guide
- [RAZORPAY_INTEGRATION.md](/app/RAZORPAY_INTEGRATION.md) - Payment setup
- [SCHEDULER_IMPLEMENTATION.md](/app/SCHEDULER_IMPLEMENTATION.md) - Cron job details
- [COMMAND_HANDLING_COMPLETE.md](/app/COMMAND_HANDLING_COMPLETE.md) - Commands guide
- [ADMIN_DASHBOARD.md](/app/ADMIN_DASHBOARD.md) - Dashboard usage

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Meta for WhatsApp Cloud API
- Google for Gemini AI
- Razorpay for payment infrastructure
- Render for hosting platform

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check documentation in `/app` directory
- Review logs for troubleshooting

## 🚧 Roadmap

- [ ] Multi-language support
- [ ] Voice message reminders
- [ ] Integration with Google Calendar
- [ ] Email notifications
- [ ] Mobile app for admin dashboard
- [ ] Analytics and insights
- [ ] Team collaboration features

---

**Built with ❤️ for productivity**
