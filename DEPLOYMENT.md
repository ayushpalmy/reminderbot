# Deployment Guide - Render.com

## 🚀 Quick Deploy to Render

### Option 1: One-Click Deploy (Blueprint)

1. **Fork this repository** to your GitHub account

2. **Connect to Render:**
   - Visit [Render Dashboard](https://dashboard.render.com/)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will detect `render.yaml` and set up everything automatically

3. **Set Environment Variables:**
   After deployment, go to the web service settings and add:

   ```
   WHATSAPP_TOKEN=your_whatsapp_token
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   GEMINI_API_KEY=your_gemini_api_key
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
   ```

4. **Done!** Your bot is live at `https://your-app-name.onrender.com`

---

### Option 2: Manual Deploy

#### Step 1: Create PostgreSQL Database

1. Go to Render Dashboard
2. Click "New" → "PostgreSQL"
3. Name: `reminder-bot-db`
4. Database: `whatsapp_bot_db`
5. User: `whatsapp_bot`
6. Region: Singapore (or closest to your users)
7. Click "Create Database"
8. **Save the Internal Database URL** (starts with `postgresql://`)

#### Step 2: Create Web Service

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name:** `whatsapp-reminder-bot`
   - **Region:** Singapore
   - **Branch:** `main`
   - **Root Directory:** Leave empty or set to `backend`
   - **Environment:** Node
   - **Build Command:** `cd backend && yarn install`
   - **Start Command:** `cd backend && node server.js`
   - **Plan:** Starter ($7/month)

#### Step 3: Set Environment Variables

Add these in the "Environment" tab:

```bash
NODE_ENV=production
PORT=8001
APP_URL=https://your-app-name.onrender.com
DATABASE_URL=[paste your PostgreSQL internal URL]
WHATSAPP_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_custom_verify_token
GEMINI_API_KEY=your_gemini_api_key
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
ADMIN_PASSWORD=your_secure_admin_password
TIMEZONE=Asia/Kolkata
CORS_ORIGINS=*
```

**Important:** Replace `your-app-name` in `APP_URL` with your actual Render service name.

#### Step 4: Configure Health Check

In "Settings" → "Health Check Path": `/health`

#### Step 5: Deploy

Click "Create Web Service" and wait for deployment to complete.

#### Step 6: Enable Keepalive (Free Tier)

After deployment, update `APP_URL` with your actual service URL:
1. Note your service URL: `https://your-service-name.onrender.com`
2. Go to "Environment" tab
3. Update `APP_URL` with your actual URL
4. Click "Save Changes"
5. Service will restart automatically

**Why?** Keepalive pings the server every 10 minutes to prevent free tier sleep.

---

## 🔧 Configuration

### WhatsApp Cloud API Setup

1. **Get Credentials:**
   - Go to [Meta for Developers](https://developers.facebook.com/)
   - Create an app or use existing
   - Add "WhatsApp" product
   - Go to "API Setup" to get:
     - Access Token (`WHATSAPP_TOKEN`)
     - Phone Number ID (`WHATSAPP_PHONE_NUMBER_ID`)

2. **Configure Webhook:**
   - URL: `https://your-app-name.onrender.com/api/webhook`
   - Verify Token: (use the value from `WHATSAPP_VERIFY_TOKEN`)
   - Subscribe to: `messages`

### Gemini API Setup

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Generate API key
3. Add to `GEMINI_API_KEY`

### Razorpay Setup

1. **Get API Keys:**
   - Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
   - Settings → API Keys
   - Generate Key ID and Secret
   - Add to `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`

2. **Configure Webhook:**
   - Settings → Webhooks
   - URL: `https://your-app-name.onrender.com/api/razorpay/webhook`
   - Events: Select `payment_link.paid`
   - Generate secret and add to `RAZORPAY_WEBHOOK_SECRET`

---

## ✅ Verify Deployment

### 1. Check Service Health
```bash
curl https://your-app-name.onrender.com/health
```
Expected: `{"status":"ok","uptime":123.45,"timestamp":"..."}`

### 2. Check WhatsApp Webhook
```bash
curl "https://your-app-name.onrender.com/api/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```
Expected: `test123`

### 3. Check Admin Dashboard
Visit: `https://your-app-name.onrender.com/admin`
Login with your `ADMIN_PASSWORD`

### 4. Check Scheduler
- Scheduler runs automatically in the background
- Check logs in Render dashboard
- Should see: `[SCHEDULER] Running scheduled check at...`

---

## 🔍 Monitoring

### View Logs
1. Go to Render Dashboard
2. Select your web service
3. Click "Logs" tab
4. Filter by:
   - `[SCHEDULER]` - Cron job activity
   - `[PROCESSING]` - Message processing
   - `[RAZORPAY]` - Payment events
   - `[ADMIN]` - Dashboard access

### Check Database
1. Go to your PostgreSQL database in Render
2. Click "Connect" → "External Connection"
3. Use psql or GUI tool to connect
4. Run queries:
```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM reminders WHERE is_done = false;
```

---

## 🐛 Troubleshooting

### Issue: Database connection fails
**Solution:**
- Verify `DATABASE_URL` is set correctly
- Check database is running in Render dashboard
- Ensure SSL is enabled in production

### Issue: Scheduler not running
**Solution:**
- Check logs for `[SCHEDULER]` messages
- Scheduler starts automatically on server boot
- Runs every minute, check timestamps in logs

### Issue: WhatsApp messages not sending
**Solution:**
- Verify `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
- Check token hasn't expired
- Verify webhook is configured in Meta dashboard

### Issue: Payment webhook not working
**Solution:**
- Verify `RAZORPAY_WEBHOOK_SECRET` matches Razorpay dashboard
- Check webhook URL is correct
- Ensure webhook is subscribed to `payment_link.paid` event

### Issue: 503 Service Unavailable
**Solution:**
- Check health endpoint: `/health`
- Verify build and start commands are correct
- Check logs for startup errors

---

## 🔒 Security Best Practices

### 1. Environment Variables
- Never commit `.env` to git
- Use strong, random passwords
- Rotate API keys periodically

### 2. Admin Dashboard
- Change default `ADMIN_PASSWORD` immediately
- Use HTTPS only (Render provides this)
- Consider IP whitelisting for production

### 3. Webhook Security
- Always verify webhook signatures
- Use HTTPS URLs only
- Keep webhook secrets confidential

### 4. Database
- Use Render's managed PostgreSQL
- Enable automatic backups
- Keep database credentials secure

---

## 📊 Scaling

### Current Setup (Starter Plan)
- **Cost:** $7/month (web service) + $7/month (database)
- **Capacity:** 
  - ~100-500 users
  - ~1000 reminders
  - 512MB RAM, 0.5 CPU

### Upgrade Path
When you grow:
1. **Standard Plan ($25/month):**
   - 2GB RAM, 1 CPU
   - Supports ~5000 users
   - Better performance

2. **Pro Plan ($85/month):**
   - 4GB RAM, 2 CPU
   - Supports ~20,000 users
   - Production-ready

3. **Database Scaling:**
   - Standard DB ($15/month): 1GB RAM
   - Pro DB ($50/month): 4GB RAM

---

## 🔄 Updates and Maintenance

### Deploy Updates
1. Push changes to GitHub
2. Render auto-deploys from `main` branch
3. Check logs for successful deployment
4. Verify functionality

### Database Migrations
If you add new tables or columns:
1. Update `config/db.js`
2. Deploy changes
3. Render will run migrations on startup

### Backup Strategy
Render provides:
- **Automatic daily backups** (retained for 7 days)
- **Manual backups** (via dashboard)
- **Point-in-time recovery** (on Pro plans)

---

## 📞 Support

### Render Issues
- [Render Status](https://status.render.com/)
- [Render Docs](https://render.com/docs)
- [Community Forum](https://community.render.com/)

### Bot Issues
1. Check logs in Render dashboard
2. Verify all environment variables are set
3. Test individual components:
   - Health check: `/health`
   - Webhook: `/api/webhook`
   - Admin: `/admin`

---

## ✅ Pre-Deployment Checklist

- [ ] PostgreSQL database created
- [ ] All environment variables set
- [ ] WhatsApp webhook configured
- [ ] Razorpay webhook configured
- [ ] Admin password changed from default
- [ ] Health check path configured (`/health`)
- [ ] Test message sent successfully
- [ ] Scheduler logs showing activity
- [ ] Admin dashboard accessible
- [ ] Payment flow tested (test mode)

---

## 🎉 Going Live

Once everything is tested:

1. **Switch to Production Keys:**
   - Use Razorpay live keys (not test)
   - Update webhook URLs if needed

2. **Monitor First Day:**
   - Check logs regularly
   - Watch for errors
   - Monitor database growth

3. **Set Up Alerts:**
   - Configure Render health check alerts
   - Set up email notifications for errors

4. **Enable Auto-Scaling:**
   - Configure auto-scaling rules if needed
   - Set up database read replicas for high load

**You're ready for production! 🚀**
