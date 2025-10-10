# EmailFilter Pro - Backend

Smart email management system backend built with FastAPI.

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (recommended)

### Setup with Docker (Recommended)

1. **Clone and navigate to backend:**
   ```bash
   cd backend
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Generate encryption key:**
   ```bash
   python generate_key.py
   ```
   Copy the output and update `ENCRYPTION_KEY` in `.env`

4. **Update .env with your credentials:**
   - Google OAuth credentials
   - SMTP settings for OTP emails
   - JWT secret keys

5. **Start all services:**
   ```bash
   docker-compose up -d
   ```

6. **Run migrations:**
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

7. **Seed database with plans:**
   ```bash
   docker-compose exec backend python seed_db.py
   ```

8. **Access the application:**
   - API: http://localhost:8000
   - API Docs: http://localhost:8000/docs
   - Flower (Celery Monitor): http://localhost:5555

### Setup without Docker

1. **Create virtual environment:**
   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   # source venv/bin/activate  # Linux/Mac
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Setup PostgreSQL and Redis:**
   - Install PostgreSQL 15+
   - Install Redis 7+
   - Create database: `createdb emailfilter`

4. **Create and configure .env:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. **Run migrations:**
   ```bash
   alembic upgrade head
   ```

6. **Seed database:**
   ```bash
   python seed_db.py
   ```

7. **Start services:**
   ```bash
   # Terminal 1 - API Server
   uvicorn app.main:app --reload

   # Terminal 2 - Celery Worker
   celery -A app.tasks.celery_app worker --loglevel=info

   # Terminal 3 - Celery Beat (optional)
   celery -A app.tasks.celery_app beat --loglevel=info
   ```

## 📁 Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── auth.py          # Authentication endpoints
│   │   │   ├── google.py        # Google OAuth
│   │   │   ├── filters.py       # Email filters
│   │   │   ├── emails.py        # Filtered emails
│   │   │   ├── users.py         # User management
│   │   │   └── webhooks.py      # Gmail Pub/Sub webhook
│   │   └── dependencies.py      # FastAPI dependencies
│   ├── core/
│   │   ├── config.py            # Configuration
│   │   ├── database.py          # Database connection
│   │   ├── redis.py             # Redis manager
│   │   └── security.py          # JWT, encryption, hashing
│   ├── models/
│   │   └── models.py            # SQLAlchemy models
│   ├── schemas/
│   │   └── schemas.py           # Pydantic schemas
│   ├── services/
│   │   ├── auth_service.py      # Authentication logic
│   │   ├── gmail_service.py     # Gmail API integration
│   │   └── filter_service.py    # Email filtering
│   ├── tasks/
│   │   ├── celery_app.py        # Celery configuration
│   │   └── email_processor.py   # Async email processing
│   └── main.py                  # FastAPI app
├── alembic/                     # Database migrations
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## 🔑 API Endpoints

### Authentication
- `POST /api/v1/auth/otp/request` - Request OTP
- `POST /api/v1/auth/otp/verify` - Verify OTP & login
- `POST /api/v1/auth/refresh` - Refresh access token

### Google OAuth
- `GET /api/v1/google/auth-url` - Get OAuth URL
- `GET /api/v1/google/callback` - OAuth callback
- `GET /api/v1/google/connected-emails` - List connected emails
- `DELETE /api/v1/google/connected-emails/{id}` - Disconnect email

### Email Filters
- `POST /api/v1/filters` - Create filter
- `GET /api/v1/filters` - List filters
- `GET /api/v1/filters/{id}` - Get filter
- `PATCH /api/v1/filters/{id}` - Update filter
- `DELETE /api/v1/filters/{id}` - Delete filter

### Filtered Emails
- `GET /api/v1/emails` - List filtered emails (paginated)
- `GET /api/v1/emails/{id}` - Get email details
- `PATCH /api/v1/emails/{id}` - Update email
- `POST /api/v1/emails/{id}/mark-read` - Mark as read
- `POST /api/v1/emails/{id}/archive` - Archive email

### Users
- `GET /api/v1/users/me` - Get current user info
- `PATCH /api/v1/users/me` - Update user
- `GET /api/v1/users/me/stats` - Get user statistics

### Webhooks
- `POST /api/v1/webhooks/gmail` - Gmail Pub/Sub webhook

## 🔧 Environment Variables

Key variables to configure in `.env`:

```env
# App
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
ENCRYPTION_KEY=your-fernet-key

# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/emailfilter

# Redis
REDIS_URL=redis://localhost:6379/0

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/google/callback
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PUBSUB_TOPIC=gmail-notifications

# SMTP (for OTP)
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

## 🧪 Development

### Create Migration
```bash
alembic revision --autogenerate -m "description"
```

### Run Migration
```bash
alembic upgrade head
```

### Rollback Migration
```bash
alembic downgrade -1
```

## 📊 Monitoring

- **Flower (Celery)**: http://localhost:5555
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## 🛡️ Security Features

- JWT authentication with short-lived tokens
- Token encryption for Google OAuth credentials
- Rate limiting on all endpoints
- Redis-based session management
- OTP-based passwordless auth
- CORS protection
- Input validation with Pydantic

## 📝 License

MIT
