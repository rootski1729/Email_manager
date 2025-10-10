# 🔧 Troubleshooting Guide

Common issues and their solutions when setting up EmailFilter Pro.

---

## 🚨 Installation Issues

### Issue: Docker not found
**Error**: `docker : The term 'docker' is not recognized`

**Solution**:
1. Install Docker Desktop from https://www.docker.com/products/docker-desktop
2. Restart your computer
3. Verify: `docker --version`

---

### Issue: Port already in use
**Error**: `Error starting userland proxy: listen tcp 0.0.0.0:8000: bind: address already in use`

**Solution**:
```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or change port in docker-compose.yml
ports:
  - "8001:8000"  # Use 8001 instead
```

---

### Issue: Permission denied on Docker volumes
**Error**: `ERROR: for postgres  Cannot create container for service postgres: failed to mount local volume`

**Solution**:
```powershell
# Reset Docker
docker-compose down -v
docker system prune -a --volumes

# Start fresh
docker-compose up -d
```

---

## 🗄️ Database Issues

### Issue: Can't connect to PostgreSQL
**Error**: `could not connect to server: Connection refused`

**Solution**:
```powershell
# Check if PostgreSQL is running
docker-compose ps postgres

# Restart PostgreSQL
docker-compose restart postgres

# Check logs
docker-compose logs postgres

# Verify it's healthy
docker-compose exec postgres pg_isready
```

---

### Issue: Migrations fail
**Error**: `Target database is not up to date`

**Solution**:
```powershell
# Check current migration version
docker-compose exec backend alembic current

# Try to upgrade
docker-compose exec backend alembic upgrade head

# If that fails, reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d postgres
sleep 10
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_db.py
```

---

### Issue: Plans not seeded
**Error**: Query returns empty when checking plans

**Solution**:
```powershell
# Check if plans exist
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "SELECT * FROM plans;"

# If empty, seed again
docker-compose exec backend python seed_db.py

# Verify
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "SELECT name, max_emails FROM plans;"
```

---

## 🔴 Redis Issues

### Issue: Can't connect to Redis
**Error**: `redis.exceptions.ConnectionError: Error connecting to Redis`

**Solution**:
```powershell
# Check if Redis is running
docker-compose ps redis

# Restart Redis
docker-compose restart redis

# Test connection
docker-compose exec redis redis-cli ping
# Should return: PONG
```

---

### Issue: Redis keys not expiring
**Error**: OTP codes never expire

**Solution**:
```powershell
# Check TTL on a key
docker-compose exec redis redis-cli
TTL otp:test@example.com:123456

# Should return positive number (seconds remaining)
# If -1, key doesn't have TTL set
```

---

## 🔑 Authentication Issues

### Issue: OTP not received
**Error**: Can't see OTP in logs

**Solution**:
```powershell
# Check backend logs for OTP
docker-compose logs backend | Select-String "OTP"

# Should see: 📧 OTP for email@example.com: 123456

# If not appearing, check SMTP settings in .env
# For now, OTP is printed to console (not actually sent)
```

---

### Issue: Invalid OTP error
**Error**: "Invalid or expired OTP"

**Causes**:
1. OTP expired (10 min validity)
2. Typo in OTP code
3. Redis connection issue

**Solution**:
```powershell
# Check if OTP is in Redis
docker-compose exec redis redis-cli KEYS "otp:*"

# Request new OTP
curl -X POST http://localhost:8000/api/v1/auth/otp/request `
  -H "Content-Type: application/json" `
  -d '{"email": "test@example.com"}'

# Check logs immediately
docker-compose logs --tail=50 backend | Select-String "OTP"
```

---

### Issue: JWT token invalid
**Error**: "Invalid authentication credentials"

**Causes**:
1. Token expired (15 min)
2. Wrong SECRET_KEY in .env
3. Token not in header

**Solution**:
```powershell
# Verify token format (should have 3 parts separated by .)
echo $token
# eyJhbGc...IUzI1NiI.eyJzdW...IjoxfQ.SflK...xPAT

# Request new token
curl -X POST http://localhost:8000/api/v1/auth/otp/verify `
  -H "Content-Type: application/json" `
  -d '{"email": "test@example.com", "code": "123456"}'

# Use in subsequent requests
$token = "paste_access_token_here"
curl -H "Authorization: Bearer $token" http://localhost:8000/api/v1/users/me
```

---

## 🔌 Google OAuth Issues

### Issue: Invalid client error
**Error**: `invalid_client` or `unauthorized_client`

**Solution**:
1. Verify GOOGLE_CLIENT_ID in .env matches Google Cloud Console
2. Verify GOOGLE_CLIENT_SECRET is correct
3. Check redirect URI:
   - In .env: `GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/google/callback`
   - In Google Console: Add same URL to authorized redirect URIs

---

### Issue: Access denied error
**Error**: `access_denied` during OAuth

**Solution**:
1. Make sure these APIs are enabled in Google Cloud:
   - Gmail API
   - Google+ API
   - Cloud Pub/Sub API
2. Use correct Google account (one with Gmail access)
3. Accept all permissions in OAuth consent screen

---

### Issue: Can't setup Pub/Sub
**Error**: Pub/Sub topic creation fails

**Solution**:
```bash
# Install gcloud CLI first
# Then create topic
gcloud config set project YOUR_PROJECT_ID
gcloud pubsub topics create gmail-notifications
gcloud pubsub topics list

# Give Gmail permission to publish
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

---

## 🌸 Celery Issues

### Issue: Worker not processing tasks
**Error**: Tasks stay in queue, never processed

**Solution**:
```powershell
# Check worker status
docker-compose ps celery_worker

# Restart worker
docker-compose restart celery_worker

# Check logs
docker-compose logs -f celery_worker

# Should see:
# [tasks] - app.tasks.email_processor.process_new_email
# celery@... ready.
```

---

### Issue: Celery import errors
**Error**: `ModuleNotFoundError: No module named 'app'`

**Solution**:
```powershell
# Check if app directory is mounted
docker-compose exec celery_worker ls -la /app/app

# Restart with rebuild
docker-compose down
docker-compose up -d --build
```

---

### Issue: Flower not accessible
**Error**: Can't access http://localhost:5555

**Solution**:
```powershell
# Check if Flower is running
docker-compose ps flower

# Check logs
docker-compose logs flower

# Restart
docker-compose restart flower
```

---

## 📡 API Issues

### Issue: 404 Not Found on valid endpoint
**Error**: `{"detail":"Not Found"}`

**Causes**:
1. Wrong URL
2. Missing /api/v1 prefix
3. Backend not started

**Solution**:
```powershell
# Verify backend is running
docker-compose ps backend

# Check health endpoint
curl http://localhost:8000/health

# Try full path
curl http://localhost:8000/api/v1/users/me `
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Issue: CORS error in browser
**Error**: `Access to fetch at 'http://localhost:8000' from origin 'http://localhost:3000' has been blocked by CORS policy`

**Solution**:
Add frontend URL to .env:
```env
BACKEND_CORS_ORIGINS=["http://localhost:3000", "http://localhost:8000"]
```

Restart backend:
```powershell
docker-compose restart backend
```

---

### Issue: 422 Validation Error
**Error**: `{"detail":[{"loc":["body","email"],"msg":"field required"}]}`

**Cause**: Missing or invalid request body

**Solution**:
```powershell
# Make sure Content-Type is set
-H "Content-Type: application/json"

# Validate JSON syntax
'{"email": "test@example.com"}'  # Valid
'{email: test@example.com}'       # Invalid (no quotes)
```

---

## 🔒 Encryption Issues

### Issue: ENCRYPTION_KEY not set
**Error**: `cryptography.fernet.InvalidToken`

**Solution**:
```powershell
# Generate new key
cd backend
python generate_key.py

# Copy output to .env
ENCRYPTION_KEY=<paste-key-here>

# Restart backend
docker-compose restart backend
```

---

### Issue: Can't decrypt tokens
**Error**: `Failed to decrypt token`

**Cause**: ENCRYPTION_KEY changed after tokens were stored

**Solution**:
```powershell
# WARNING: This will disconnect all Gmail accounts
docker-compose exec postgres psql -U emailfilter -d emailfilter
DELETE FROM connected_emails;
\q

# Users will need to reconnect their Gmail accounts
```

---

## 📊 Performance Issues

### Issue: Slow API responses
**Symptoms**: Requests take > 1 second

**Solutions**:

1. **Check database connections**:
```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter
SELECT count(*) FROM pg_stat_activity;
```

2. **Check Redis cache**:
```powershell
docker-compose exec redis redis-cli
INFO stats
```

3. **Check database indexes**:
```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter
\d email_filters
# Should see indexes on user_id, is_active
```

4. **Enable query logging**:
Edit .env:
```env
DEBUG=True
```

---

### Issue: Memory issues
**Error**: Container crashes, out of memory

**Solution**:
```powershell
# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory → Increase to 4GB+

# Or limit service memory in docker-compose.yml
services:
  postgres:
    deploy:
      resources:
        limits:
          memory: 1G
```

---

## 🧪 Testing Issues

### Issue: Can't run tests
**Error**: Tests fail to import modules

**Solution**:
```powershell
# Make sure you're in backend directory
cd backend

# Install dependencies in local venv (for IDE)
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Run tests in Docker
docker-compose exec backend pytest
```

---

## 📝 Logging Issues

### Issue: Logs not showing
**Problem**: Empty logs when running `docker-compose logs`

**Solution**:
```powershell
# Check specific service
docker-compose logs backend
docker-compose logs -f backend  # Follow mode

# Check all services
docker-compose logs --tail=100

# If still empty, check container status
docker-compose ps
```

---

## 🚀 Deployment Issues

### Issue: Environment variables not loaded
**Error**: Settings using default values

**Solution**:
1. Verify .env file exists in backend/
2. Restart services: `docker-compose down && docker-compose up -d`
3. Check env vars in container:
```powershell
docker-compose exec backend env | grep DATABASE_URL
```

---

### Issue: Can't access from outside localhost
**Problem**: Can only access from same machine

**Solution**:
```powershell
# Check if ports are exposed in docker-compose.yml
ports:
  - "8000:8000"  # 0.0.0.0:8000 (all interfaces)

# Check Windows Firewall
# Allow port 8000 inbound

# For production, use reverse proxy (Nginx)
```

---

## 🆘 Last Resort: Complete Reset

If nothing works, reset everything:

```powershell
# Stop all containers
docker-compose down

# Remove all volumes (deletes database!)
docker-compose down -v

# Remove all Docker images
docker system prune -a --volumes

# Rebuild from scratch
docker-compose build --no-cache
docker-compose up -d

# Wait for services
Start-Sleep -Seconds 15

# Initialize
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_db.py

# Verify
curl http://localhost:8000/health
```

---

## 📞 Getting Help

### Check Logs First
```powershell
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs postgres
docker-compose logs redis
docker-compose logs celery_worker

# Follow logs
docker-compose logs -f
```

### Check Service Status
```powershell
docker-compose ps
```

### Check Health
```powershell
curl http://localhost:8000/health
docker-compose exec postgres pg_isready
docker-compose exec redis redis-cli ping
```

### Useful Commands
```powershell
# Restart everything
docker-compose restart

# Rebuild and restart
docker-compose up -d --build

# Shell into container
docker-compose exec backend sh
docker-compose exec postgres sh

# Check container resources
docker stats
```

---

## 📚 Additional Resources

- **Docker Docs**: https://docs.docker.com/
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Redis Docs**: https://redis.io/docs/
- **Celery Docs**: https://docs.celeryproject.org/

---

**Still stuck?** 
1. Check `TESTING_GUIDE.md` for step-by-step tests
2. Review `SETUP_GUIDE.md` for setup instructions
3. Check logs: `docker-compose logs -f`

**Everything working?** Move to `TESTING_GUIDE.md` to test all features! 🎉
