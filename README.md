# 📧 EmailFilter Pro

**Smart Email Management System** - Never miss important emails again.

Filter and manage multiple Gmail accounts with AI-powered rules, real-time notifications, and intelligent inbox organization.

---

## 🎯 Problem We Solve

Managing 5-6 email accounts? Drowning in notifications? Missing important emails in the clutter?

**EmailFilter Pro** intelligently filters your emails based on custom rules and sends you notifications only for what matters.

---

## ✨ Features

### MVP (Current)
- ✅ **Multi-Account Gmail** - Connect up to 10 Gmail accounts
- ✅ **Smart Filters** - Filter by sender, subject, keywords
- ✅ **Real-Time Sync** - Gmail Pub/Sub integration
- ✅ **Tiered Plans** - Free, Basic, Pro
- ✅ **Secure Auth** - OTP-based passwordless login
- ✅ **API-First** - RESTful API with FastAPI

### Coming Soon
- 🔜 WhatsApp Alerts - Get critical emails on WhatsApp
- 🔜 Email Digests - Daily/weekly summaries
- 🔜 AI Categorization - Auto-categorize emails
- 🔜 Web Dashboard - Beautiful UI
- 🔜 Mobile App - iOS & Android

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

**Tech Stack:**
- **Backend**: FastAPI (Python 3.11)
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Queue**: Celery
- **Email**: Gmail API + Pub/Sub
- **Auth**: JWT + OTP
- **Deploy**: Docker + Docker Compose

---

## 🚀 Quick Start

### For Users

**Sign Up**: Coming soon at https://emailfilter.pro

### For Developers

```bash
# Clone repository
git clone https://github.com/rootski1729/Drive_manager.git
cd Drive_manager/backend

# Copy environment template
cp .env.example .env

# Generate encryption key
python generate_key.py

# Update .env with your credentials

# Start with Docker
docker-compose up -d

# Initialize database
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_db.py

# Access API
open http://localhost:8000/docs
```

See **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for detailed instructions.

---

## 📊 Pricing

| Plan | Price | Emails | Filters | WhatsApp |
|------|-------|--------|---------|----------|
| **Free** | $0 | 2 | 5 | ❌ |
| **Basic** | $5/mo | 5 | 20 | ✅ (10/day) |
| **Pro** | $12/mo | 10 | Unlimited | ✅ (100/day) |

---

## 🔐 Security

- 🔒 End-to-end encrypted token storage (Fernet)
- 🔑 JWT authentication with short-lived tokens
- 🚦 Rate limiting on all endpoints
- 🔐 OTP-based passwordless auth
- ✅ CORS protection
- 📝 Comprehensive input validation

---

## 📖 API Documentation

### Authentication
```bash
# Request OTP
POST /api/v1/auth/otp/request
{
  "email": "user@example.com"
}

# Verify OTP
POST /api/v1/auth/otp/verify
{
  "email": "user@example.com",
  "code": "123456"
}
```

### Connect Gmail
```bash
# Get OAuth URL
GET /api/v1/google/auth-url
Authorization: Bearer {token}

# Complete in browser, then:
GET /api/v1/google/callback?code=...
```

### Create Filter
```bash
POST /api/v1/filters
Authorization: Bearer {token}
{
  "name": "VIP Clients",
  "filter_type": "sender",
  "conditions": {
    "sender": "client@important.com"
  },
  "action_type": "whatsapp"
}
```

Full API docs: http://localhost:8000/docs

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

---

## 📝 License

MIT License - see [LICENSE](LICENSE)

---

## 👥 Team

Built with ❤️ for people drowning in emails.

- **Backend**: FastAPI + PostgreSQL + Redis
- **Status**: MVP Ready
- **Target**: 500 users
- **Goal**: Make email management effortless

---

## 📞 Contact

- **Issues**: [GitHub Issues](https://github.com/rootski1729/Drive_manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rootski1729/Drive_manager/discussions)
- **Email**: support@emailfilter.pro (coming soon)

---

**⭐ Star us on GitHub if this helps you!**

---

## 🗺️ Roadmap

### Q1 2025 - MVP Launch
- [x] Core API
- [x] Gmail integration
- [x] Basic filtering
- [ ] Web dashboard
- [ ] User testing (50 users)

### Q2 2025 - Scale
- [ ] WhatsApp integration
- [ ] AI-powered categorization
- [ ] Mobile apps
- [ ] 500+ active users

### Q3 2025 - Enterprise
- [ ] Team workspaces
- [ ] Advanced analytics
- [ ] Custom integrations
- [ ] Enterprise plan

---

Made with 🚀 by developers who hate messy inboxes.
