# 📋 EmailFilter Pro - Quick Reference

## 🚀 Start/Stop Commands

```powershell
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# Restart a service
docker-compose restart backend

# View logs
docker-compose logs -f backend

# Rebuild and restart
docker-compose up -d --build
```

## 🔑 Key URLs

- **API**: http://localhost:8000
- **Docs**: http://localhost:8000/docs
- **Health**: http://localhost:8000/health
- **Flower**: http://localhost:5555

## 📡 Quick API Tests

### Get OTP
```powershell
curl -X POST http://localhost:8000/api/v1/auth/otp/request `
  -H "Content-Type: application/json" `
  -d '{\"email\": \"test@example.com\"}'
```

### Verify OTP
```powershell
curl -X POST http://localhost:8000/api/v1/auth/otp/verify `
  -H "Content-Type: application/json" `
  -d '{\"email\": \"test@example.com\", \"code\": \"123456\"}'
```

### Get User Info
```powershell
curl -H "Authorization: Bearer YOUR_TOKEN" `
  http://localhost:8000/api/v1/users/me
```

### Create Filter
```powershell
curl -X POST http://localhost:8000/api/v1/filters `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{\"name\":\"Test\",\"filter_type\":\"sender\",\"conditions\":{\"sender\":\"test@test.com\"},\"action_type\":\"notify\"}'
```

## 🗄️ Database Commands

```powershell
# Connect to PostgreSQL
docker-compose exec postgres psql -U emailfilter -d emailfilter

# List tables
\dt

# View users
SELECT * FROM users;

# View plans
SELECT * FROM plans;

# Exit
\q
```

## 🔴 Redis Commands

```powershell
# Connect to Redis
docker-compose exec redis redis-cli

# List all keys
KEYS *

# Get a key
GET user_session:1

# Exit
EXIT
```

## 📦 Migrations

```powershell
# Create migration
docker-compose exec backend alembic revision --autogenerate -m "description"

# Apply migrations
docker-compose exec backend alembic upgrade head

# Rollback
docker-compose exec backend alembic downgrade -1

# Check current version
docker-compose exec backend alembic current
```

## 🌱 Seed Data

```powershell
# Seed plans
docker-compose exec backend python seed_db.py
```

## 🔍 Debugging

```powershell
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend
docker-compose logs -f celery_worker
docker-compose logs -f postgres
docker-compose logs -f redis

# Check service status
docker-compose ps

# Shell into container
docker-compose exec backend sh
docker-compose exec postgres sh
```

## 🛑 Troubleshooting

### Reset Everything
```powershell
docker-compose down -v
docker-compose up -d
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_db.py
```

### Check Service Health
```powershell
# Postgres
docker-compose exec postgres pg_isready

# Redis
docker-compose exec redis redis-cli ping

# API
curl http://localhost:8000/health
```

## 📊 Monitoring

```powershell
# Celery tasks (Flower)
start http://localhost:5555

# API docs (Swagger)
start http://localhost:8000/docs

# System resources
docker stats
```

## 🔒 Security Keys

```powershell
# Generate encryption key
python backend/generate_key.py

# Generate random secret
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## 🏗️ Project Structure

```
Drive_manager/
├── backend/
│   ├── app/
│   │   ├── api/v1/       # Endpoints
│   │   ├── core/         # Config, DB, Security
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   ├── tasks/        # Celery tasks
│   │   └── main.py       # FastAPI app
│   ├── alembic/          # Migrations
│   ├── docker-compose.yml
│   └── requirements.txt
├── README.md
├── SETUP_GUIDE.md
├── TESTING_GUIDE.md
└── PROJECT_SUMMARY.md
```

## 🎯 Common Workflows

### Add New Endpoint
1. Create in `app/api/v1/your_module.py`
2. Add to `app/api/v1/__init__.py`
3. Test in Swagger UI

### Add New Model
1. Add to `app/models/models.py`
2. Create migration: `alembic revision --autogenerate -m "add model"`
3. Apply: `alembic upgrade head`

### Update Dependencies
1. Edit `requirements.txt`
2. Rebuild: `docker-compose up -d --build`

## 📈 Performance Tips

- Use Redis for caching
- Paginate all list endpoints
- Index database queries
- Use async/await
- Monitor with Flower

## 🔗 Useful Links

- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **SQLAlchemy**: https://docs.sqlalchemy.org/
- **Celery**: https://docs.celeryproject.org/
- **Gmail API**: https://developers.google.com/gmail/api
- **Google Pub/Sub**: https://cloud.google.com/pubsub/docs

---

**📚 Full Documentation**
- Setup: `SETUP_GUIDE.md`
- Testing: `TESTING_GUIDE.md`
- Architecture: `PROJECT_SUMMARY.md`

**🆘 Need Help?**
- Check logs: `docker-compose logs -f`
- View docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health
