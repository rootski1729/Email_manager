# 🚀 COMPLETE SETUP GUIDE - EmailFilter Pro

Follow these steps to get your application running.

## Step 1: Generate Security Keys

```powershell
cd backend
python generate_key.py
```

Copy the generated key. You'll need it for the `.env` file.

## Step 2: Create Environment File

```powershell
cp .env.example .env
```

Edit `.env` and update these CRITICAL fields:

```env
# Generate these with: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=<generate-a-strong-key>
JWT_SECRET_KEY=<generate-a-strong-key>

# From step 1
ENCRYPTION_KEY=<your-fernet-key-from-generate_key.py>

# Google OAuth - Get from https://console.cloud.google.com/
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_PROJECT_ID=<your-google-project-id>

# SMTP for OTP emails (Gmail example)
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=<your-gmail-app-password>
```

## Step 3: Setup Google Cloud Project

### 3.1 Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Create new project "emailfilter-pro"
3. Note down the PROJECT_ID

### 3.2 Enable APIs
Enable these APIs in your project:
- Gmail API
- Cloud Pub/Sub API
- Google+ API (for user info)

### 3.3 Create OAuth 2.0 Credentials
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client ID"
3. Application type: Web application
4. Name: EmailFilter Backend
5. Authorized redirect URIs:
   - http://localhost:8000/api/v1/google/callback
   - http://localhost:3000/auth/callback (for frontend)
6. Save Client ID and Client Secret → Add to `.env`

### 3.4 Setup Pub/Sub Topic
```bash
# Install gcloud CLI first
gcloud pubsub topics create gmail-notifications
gcloud pubsub subscriptions create gmail-notifications-sub --topic gmail-notifications
```

## Step 4: Start Application with Docker

```powershell
# Build and start all services
docker-compose up -d

# Check if services are running
docker-compose ps

# View logs
docker-compose logs -f backend
```

## Step 5: Initialize Database

```powershell
# Run migrations
docker-compose exec backend alembic upgrade head

# Seed initial data (subscription plans)
docker-compose exec backend python seed_db.py
```

## Step 6: Verify Installation

### Check Health
```powershell
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "app": "EmailFilter Pro",
  "version": "1.0.0",
  "environment": "development"
}
```

### Access Services
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Flower (Celery Monitor)**: http://localhost:5555

## Step 7: Test Authentication Flow

### 7.1 Request OTP
```powershell
curl -X POST http://localhost:8000/api/v1/auth/otp/request `
  -H "Content-Type: application/json" `
  -d '{"email": "test@example.com"}'
```

### 7.2 Check terminal for OTP
Look for: `📧 OTP for test@example.com: XXXXXX`

### 7.3 Verify OTP
```powershell
curl -X POST http://localhost:8000/api/v1/auth/otp/verify `
  -H "Content-Type: application/json" `
  -d '{"email": "test@example.com", "code": "XXXXXX"}'
```

You'll get JWT tokens in response!

## Step 8: Connect Gmail Account

### 8.1 Get OAuth URL
```powershell
curl http://localhost:8000/api/v1/google/auth-url `
  -H "Authorization: Bearer <your-access-token>"
```

### 8.2 Visit the URL in browser
Complete Google OAuth flow

## 📊 Monitoring

### View Celery Tasks
http://localhost:5555

### View Logs
```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f celery_worker
```

### Database
```powershell
# Connect to PostgreSQL
docker-compose exec postgres psql -U emailfilter -d emailfilter

# View tables
\dt

# View users
SELECT * FROM users;
```

## 🛑 Troubleshooting

### Issue: Can't connect to database
```powershell
docker-compose restart postgres
docker-compose logs postgres
```

### Issue: Redis connection failed
```powershell
docker-compose restart redis
docker-compose exec redis redis-cli ping
```

### Issue: Migrations fail
```powershell
# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d postgres redis
docker-compose exec backend alembic upgrade head
```

### Issue: Celery worker not processing
```powershell
docker-compose restart celery_worker
docker-compose logs -f celery_worker
```

## 🔄 Development Workflow

### Make code changes
Code changes are auto-reloaded (mounted volumes)

### Create new migration
```powershell
docker-compose exec backend alembic revision --autogenerate -m "add new field"
docker-compose exec backend alembic upgrade head
```

### Restart services
```powershell
docker-compose restart backend
docker-compose restart celery_worker
```

### Stop all services
```powershell
docker-compose down
```

### Clean everything (including data)
```powershell
docker-compose down -v
```

## ✅ Next Steps

1. **Frontend**: Build React/Vue frontend to consume these APIs
2. **WhatsApp**: Integrate Twilio for WhatsApp notifications
3. **Email Digests**: Implement scheduled digest emails
4. **Analytics**: Add usage tracking and analytics
5. **Payment**: Integrate Stripe for paid plans

## 🎯 MVP Features Checklist

- [x] User authentication (OTP-based)
- [x] Google OAuth for Gmail
- [x] Email filters (sender, subject, body)
- [x] Filter matched emails storage
- [x] Subscription plans (Free, Basic, Pro)
- [x] Gmail Pub/Sub webhook
- [x] Async email processing (Celery)
- [x] Redis caching
- [x] Rate limiting
- [x] Token encryption
- [ ] WhatsApp notifications (TODO)
- [ ] Email digests (TODO)
- [ ] Frontend UI (TODO)

---

**Happy coding! 🚀**
