# 📧 EmailFilter Pro

**Smart Email Management System** - Never miss important emails again.

Filter and manage multiple Gmail accounts with AI-powered rules, real-time notifications, and intelligent inbox organization.

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)](https://docker.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%23316192.svg?style=flat&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=flat&logo=redis&logoColor=white)](https://redis.io)
[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://python.org)

---

## 🎯 Problem We Solve

Managing 5-6 email accounts? Drowning in notifications? Missing important emails in the clutter?

**EmailFilter Pro** intelligently filters your emails based on custom rules and sends you notifications only for what matters.

### Key Challenges Addressed

- **Information Overload**: Too many email notifications from multiple accounts
- **Lost Important Emails**: Critical messages buried in clutter
- **No Cross-Account Filtering**: Can't filter across multiple Gmail accounts
- **Missing Time-Sensitive Communications**: Urgent emails get lost

---

## ✨ Features

### ✅ MVP (Current)

- 🔗 **Multi-Account Gmail** - Connect up to 10 Gmail accounts (plan-based limits)
- 🎯 **Smart Filters** - Filter by sender, subject, keywords, body text
- ⚡ **Real-Time Sync** - Gmail Pub/Sub integration (< 5 second processing)
- 📱 **Chrome Extension** - Beautiful UI for managing filters and viewing emails
- 💰 **Tiered Plans** - FREE, BASIC ($5/mo), PRO ($12/mo)
- 🔐 **Secure Auth** - OTP-based passwordless login
- 🚀 **API-First** - Complete RESTful API with FastAPI
- 📧 **Email Notifications** - SMTP integration for OTP codes
- 💬 **WhatsApp Ready** - Twilio integration for notifications

### 🔜 Coming Soon

- 📊 **Web Dashboard** - React/Vue SPA for filter management
- 🤖 **AI Categorization** - ML-powered email categorization
- 📱 **Mobile Apps** - iOS & Android native apps
- 📈 **Advanced Analytics** - Usage dashboards and metrics
- 👥 **Team Workspaces** - Enterprise collaboration features

---

## 🏗️ Architecture

```
┌─────────────┐
│   Gmail 1   │───┐
│   Gmail 2   │───┤
│   Gmail N   │───┤
└─────────────┘   │
                  │  Push Notifications
                  ▼
         ┌────────────────┐
         │  Gmail Pub/Sub │
         └────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  Webhook API   │
         └────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  Celery Queue  │
         └────────────────┘
                  │
                  ▼
    ┌────────────────────────┐
    │  Filter Engine (Redis) │
    └────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼────┐     ┌─────▼─────┐
    │   DB    │     │ WhatsApp  │
    │ (Store) │     │  (Notify) │
    └─────────┘     └───────────┘
```

### Tech Stack

**Backend**
- **Framework**: FastAPI 0.109.0 (Python 3.11+)
- **Database**: PostgreSQL 15 with SQLAlchemy 2.0 (async)
- **Cache/Queue**: Redis 7 (sessions, rate limiting, caching, Celery broker)
- **Task Queue**: Celery 5.3.6 with Redis broker
- **Email API**: Google Gmail API + Pub/Sub webhooks
- **Notifications**: Twilio (WhatsApp), SMTP (email)

**Frontend**
- **Chrome Extension**: Manifest V3 with service worker
- **UI Framework**: Tailwind CSS for responsive design
- **State Management**: Chrome Storage API + local state

**Security**
- **Authentication**: JWT tokens (15min access, 7-day refresh)
- **Encryption**: Fernet encryption for OAuth tokens
- **OTP**: Redis-backed OTP system (2-minute expiry)
- **Rate Limiting**: SlowAPI (60 req/min per IP)
- **CORS**: Configured for extension origins

**DevOps**
- **Containerization**: Docker & Docker Compose
- **Migrations**: Alembic (PostgreSQL schema management)
- **Monitoring**: Flower (Celery dashboard)
- **Development**: Hot reload, debug logging

---

## 🚀 Quick Start

### Prerequisites

- **Docker & Docker Compose** (latest versions)
- **Python 3.11+** (for local development)
- **Google Cloud Project** (for Gmail API)
- **SMTP Server** (Gmail, SendGrid, etc.)
- **Twilio Account** (for WhatsApp - optional)

### For Users

**Sign Up**: Coming soon at https://emailfilter.pro

### For Developers

#### 1. Clone & Setup

```bash
# Clone repository
git clone https://github.com/rootski1729/Drive_manager.git
cd Drive_manager/backend

# Copy environment template
cp .env.example .env

# Generate encryption key
python generate_key.py
```

#### 2. Configure Environment

Edit `backend/.env` with your credentials:

```env
# Database
DATABASE_URL=postgresql+asyncpg://emailfilter:password@localhost:5432/emailfilter

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT & Encryption
SECRET_KEY=your-super-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here
ENCRYPTION_KEY=your-fernet-key-here

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_PROJECT_ID=your-google-project-id

# SMTP (for OTP emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# WhatsApp (optional)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# API Settings
API_BASE_URL=http://localhost:8000
```

#### 3. Start Services

```bash
# Start all services with Docker
docker-compose up -d

# Or start individual services
docker-compose up -d postgres redis
docker-compose up backend
```

#### 4. Initialize Database

```bash
# Run migrations
docker-compose exec backend alembic upgrade head

# Seed subscription plans
docker-compose exec backend python seed_db.py
```

#### 5. Load Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `Drive_manager/extension/` folder
5. Extension appears in toolbar

#### 6. Test the System

```bash
# Health check
curl http://localhost:8000/health

# API documentation
open http://localhost:8000/docs

# Celery monitoring
open http://localhost:5555
```

See **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for detailed instructions.

---

## 📊 Pricing Plans

| Plan | Price | Gmail Accounts | Filters | WhatsApp Alerts | Features |
|------|-------|----------------|---------|-----------------|----------|
| **FREE** | $0 | 2 | 5 | ❌ | Basic filtering, email notifications |
| **BASIC** | $5/mo | 5 | 20 | ✅ (10/day) | All FREE + WhatsApp alerts |
| **PRO** | $12/mo | 10 | Unlimited | ✅ (100/day) | All BASIC + priority support, advanced filters |

---

## 📡 API Documentation

### Base URL: `http://localhost:8000/api/v1`

### Authentication Flow

#### 1. Request OTP

```bash
POST /auth/otp/request
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### 2. Verify OTP & Get Tokens

```bash
POST /auth/otp/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

#### 3. Use Bearer Token

```bash
Authorization: Bearer <access_token>
```

### Gmail Integration

#### Connect Gmail Account

```bash
# Get OAuth URL
GET /google/auth-url
Authorization: Bearer <token>

# Response: {"auth_url": "https://accounts.google.com/o/oauth2/v2/auth?..."}
# User authorizes in browser → redirects to /google/callback
# Account automatically connected
```

#### List Connected Accounts

```bash
GET /google/connected-emails
Authorization: Bearer <token>
```

#### Fetch Emails

**All Inboxes:**
```bash
GET /gmail/emails/all?max_results=20&query=is:unread
Authorization: Bearer <token>
```

**Specific Inbox:**
```bash
GET /gmail/emails/inbox/{connected_email_id}?max_results=20&page_token=abc123
Authorization: Bearer <token>
```

**Single Email:**
```bash
GET /gmail/emails/inbox/{id}/message/{message_id}?format=full
Authorization: Bearer <token>
```

### Filter Management

#### Create Filter

```bash
POST /filters
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "VIP Clients",
  "filter_type": "sender",
  "conditions": {
    "sender": "client@important.com"
  },
  "action_type": "whatsapp",
  "priority": 1
}
```

#### List Filters

```bash
GET /filters
Authorization: Bearer <token>
```

### Gmail Search Queries

```
is:unread                    # Unread emails only
from:alice@example.com       # From specific sender
subject:invoice              # Subject contains "invoice"
has:attachment               # Has attachments
after:2025/10/01            # After specific date
is:starred                   # Starred emails
in:sent                      # Sent emails
label:inbox                  # Inbox only
```

### Rate Limits

- **OTP Requests**: 3 per 15 minutes per email
- **API Calls**: 60 per minute per IP
- **Webhooks**: 1000 per minute (from Gmail)

Full API docs: http://localhost:8000/docs

---

## 🧪 Testing & Verification

### Pre-flight Checks

- [ ] `.env` configured with all credentials
- [ ] `ENCRYPTION_KEY` generated
- [ ] Docker services running (`docker-compose ps`)
- [ ] Database migrated (`alembic current`)
- [ ] Plans seeded (`SELECT * FROM plans;`)

### API Testing Examples

#### Health Check

```bash
curl http://localhost:8000/health
# Expected: {"status": "healthy", "app": "EmailFilter Pro"}
```

#### OTP Flow

```bash
# Request OTP
curl -X POST http://localhost:8000/api/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Check logs for OTP code
docker-compose logs backend | grep "OTP for test@example.com"

# Verify OTP (replace 123456 with actual code)
curl -X POST http://localhost:8000/api/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "code": "123456"}'
```

#### Gmail Connection

```bash
# Get auth URL
curl http://localhost:8000/api/v1/google/auth-url \
  -H "Authorization: Bearer YOUR_TOKEN"

# Open URL in browser, authorize, check connected accounts
curl http://localhost:8000/api/v1/google/connected-emails \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Database Verification

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U emailfilter -d emailfilter

# Check tables
\dt

# View users
SELECT id, email, is_verified FROM users;

# View plans
SELECT name, max_emails, max_filters, price_monthly FROM plans;

# Exit
\q
```

### Redis Verification

```bash
# Connect to Redis
docker-compose exec redis redis-cli

# List keys
KEYS *

# Check OTP keys
KEYS otp:*

# Exit
EXIT
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### Docker Issues

```bash
# Port already in use
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Permission denied on volumes
docker-compose down -v
docker system prune -a --volumes
docker-compose up -d
```

#### Database Issues

```bash
# Can't connect to PostgreSQL
docker-compose ps postgres
docker-compose restart postgres
docker-compose exec postgres pg_isready

# Migrations fail
docker-compose exec backend alembic current
docker-compose exec backend alembic upgrade head

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d postgres
sleep 10
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_db.py
```

#### Redis Issues

```bash
# Redis not responding
docker-compose ps redis
docker-compose restart redis
docker-compose exec redis redis-cli ping  # Should return PONG
```

#### Gmail API Issues

```bash
# OAuth callback fails
# Check Google Cloud Console credentials
# Verify redirect URIs include: http://localhost:8000/api/v1/google/callback

# Token refresh fails
# Check ENCRYPTION_KEY is set
# Verify Google OAuth credentials in .env
```

#### Extension Issues

```bash
# Extension won't load
# Check manifest.json syntax
# Verify all file paths exist
# Try chrome://extensions → reload extension

# API calls fail
# Check API_BASE_URL in extension/popup/popup.js
# Verify CORS settings in backend
```

### Logs & Debugging

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend
docker-compose logs -f celery_worker

# Check service status
docker-compose ps

# Shell into container
docker-compose exec backend sh
```

---

## 📊 Database Schema

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | `id`, `email`, `phone`, `is_active`, `is_verified` |
| `plans` | Subscription plans | `name`, `max_emails`, `max_filters`, `price_monthly` |
| `user_plans` | User subscriptions | `user_id`, `plan_id`, `expires_at` |
| `connected_emails` | Gmail accounts | `user_id`, `email_address`, `encrypted_tokens` |
| `email_filters` | Filter rules | `user_id`, `filter_type`, `conditions`, `action_type` |
| `filtered_emails` | Matched emails | `user_id`, `gmail_message_id`, `sender`, `subject` |
| `notification_preferences` | User settings | `user_id`, `whatsapp_number`, `digest_frequency` |
| `usage_metrics` | Analytics | `user_id`, `emails_processed`, `api_calls` |

### Indexes

- Users: `email` (unique)
- Filters: `user_id + is_active`
- Emails: `user_id + received_at`, `gmail_message_id`
- Connected Emails: `user_id + email_address` (unique composite)

---

## 🔐 Security

- 🔒 End-to-end encrypted token storage (Fernet)
- 🔑 JWT authentication with short-lived tokens
- 🚦 Rate limiting on all endpoints
- 🔐 OTP-based passwordless auth
- ✅ CORS protection
- 📝 Comprehensive input validation

---

## 🚀 Deployment

### Development (Docker Compose)

```bash
# Start all services
docker-compose up -d

# Includes:
# - PostgreSQL (port 5432)
# - Redis (port 6379)
# - FastAPI Backend (port 8000)
# - Celery Worker + Beat
# - Flower Dashboard (port 5555)
```

### Production Considerations

#### Infrastructure

- **Database**: AWS RDS PostgreSQL or DigitalOcean Managed DB
- **Cache/Queue**: AWS ElastiCache Redis or Redis Cloud
- **Application**: Docker containers on Kubernetes/ECS
- **Load Balancer**: AWS ALB or Nginx
- **SSL**: Let's Encrypt certificates

#### Scaling

- **Horizontal Scaling**: Multiple backend instances
- **Database**: Read replicas for analytics
- **Redis**: Separate instances for cache vs queue
- **CDN**: CloudFront for static assets

#### Monitoring

- **Application**: Sentry for error tracking
- **Infrastructure**: Prometheus + Grafana
- **Logs**: ELK stack (Elasticsearch, Logstash, Kibana)
- **Performance**: New Relic or DataDog

#### Security

- **Secrets**: AWS Secrets Manager or HashiCorp Vault
- **Environment**: Separate dev/staging/prod
- **Backups**: Automated database backups
- **Compliance**: GDPR compliance for EU users

---

## 🤝 Contributing

We welcome contributions! Here's how:

### Development Setup

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Set up development environment (see Quick Start)
4. Make changes with tests
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open Pull Request

### Code Standards

- **Python**: Black formatting, isort imports
- **TypeScript**: ESLint, Prettier
- **Testing**: pytest for backend, Jest for frontend
- **Documentation**: Update README and API docs

### Testing

```bash
# Backend tests
docker-compose exec backend pytest

# Extension tests
cd extension
npm test

# Integration tests
docker-compose exec backend python -m pytest tests/integration/
```

---

## 📝 License

MIT License - see [LICENSE](LICENSE)

---

## 👥 Team

Built with ❤️ for people drowning in emails.

**Current Status**: MVP Ready for beta testing  
**Target**: 500 active users in Q1 2025  
**Mission**: Make email management effortless

---

## 🗺️ Roadmap

### ✅ Completed (MVP)

- [x] Multi-account Gmail OAuth integration
- [x] Smart filtering engine (sender, subject, body)
- [x] Real-time Gmail Pub/Sub processing
- [x] Chrome extension with beautiful UI
- [x] Subscription plans (FREE/BASIC/PRO)
- [x] OTP-based authentication
- [x] Email & WhatsApp notifications
- [x] Redis caching and Celery queue
- [x] Comprehensive API (FastAPI)
- [x] Docker containerization

### 🚧 Q4 2025 (Beta Launch)

- [ ] Web dashboard (React/Vue)
- [ ] Advanced filters (regex, ML categorization)
- [ ] Mobile apps (React Native)
- [ ] User analytics dashboard
- [ ] Beta user testing (50 users)
- [ ] Performance optimization

### 🎯 Q1 2026 (Scale)

- [ ] 500+ active users
- [ ] Enterprise features (team workspaces)
- [ ] Advanced analytics
- [ ] Custom integrations
- [ ] API rate limiting improvements

### 🚀 Q2 2026 (Enterprise)

- [ ] White-label solution
- [ ] Advanced compliance features
- [ ] Multi-tenant architecture
- [ ] 24/7 support infrastructure

---

## 📞 Support & Contact

- **🐛 Issues**: [GitHub Issues](https://github.com/rootski1729/Drive_manager/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/rootski1729/Drive_manager/discussions)
- **📧 Email**: support@emailfilter.pro (coming soon)
- **📱 Twitter**: [@EmailFilterPro](https://twitter.com/EmailFilterPro)

### Getting Help

1. Check this README first
2. Search [existing issues](https://github.com/rootski1729/Drive_manager/issues)
3. Create a new issue with:
   - Steps to reproduce
   - Environment details
   - Error logs
   - Expected vs actual behavior

---

## 🙏 Acknowledgments

- **FastAPI** - The best Python web framework
- **Google Gmail API** - Powerful email integration
- **PostgreSQL** - Reliable database
- **Redis** - Lightning-fast caching
- **Celery** - Robust task queue
- **Docker** - Containerization made easy

---

**⭐ Star us on GitHub if this helps you manage your emails better!**

Made with 🚀 by developers who hate messy inboxes.