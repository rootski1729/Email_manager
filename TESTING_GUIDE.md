# ✅ Testing & Verification Checklist

Use this document to test all features of EmailFilter Pro.

---

## 🚀 Pre-flight Checks

### 1. Environment Setup
- [ ] `.env` file exists with all required variables
- [ ] `ENCRYPTION_KEY` is set (run `python generate_key.py`)
- [ ] `SECRET_KEY` and `JWT_SECRET_KEY` are set (generate random strings)
- [ ] Google OAuth credentials configured
- [ ] SMTP credentials for OTP emails

### 2. Services Running
```powershell
docker-compose ps
```
All services should show "Up":
- [ ] emailfilter_postgres
- [ ] emailfilter_redis
- [ ] emailfilter_backend
- [ ] emailfilter_celery_worker
- [ ] emailfilter_celery_beat
- [ ] emailfilter_flower

### 3. Database Initialized
```powershell
docker-compose exec backend alembic current
```
- [ ] Should show latest migration version
- [ ] No errors in output

```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "\dt"
```
- [ ] Should list all tables (users, plans, etc.)

### 4. Seed Data
```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "SELECT name, max_emails, max_filters FROM plans;"
```
- [ ] Should show 3 plans: FREE, BASIC, PRO

---

## 🧪 API Testing

### Test 1: Health Check
```powershell
curl http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "app": "EmailFilter Pro",
  "version": "1.0.0",
  "environment": "development"
}
```
- [ ] Status 200 OK
- [ ] JSON response received

---

### Test 2: Request OTP
```powershell
curl -X POST http://localhost:8000/api/v1/auth/otp/request `
  -H "Content-Type: application/json" `
  -d '{\"email\": \"test@example.com\"}'
```

**Expected Response:**
```json
{
  "message": "OTP sent to test@example.com. Valid for 10 minutes.",
  "success": true
}
```

**Check Logs for OTP:**
```powershell
docker-compose logs backend | Select-String "OTP"
```
- [ ] Should see: `📧 OTP for test@example.com: XXXXXX`
- [ ] Copy the 6-digit code

**Test OTP in Redis:**
```powershell
docker-compose exec redis redis-cli KEYS "otp:*"
```
- [ ] Should show OTP key

---

### Test 3: Verify OTP & Get Tokens
```powershell
# Replace XXXXXX with your actual OTP
$otp = "123456"  # Your OTP from logs

$response = Invoke-RestMethod -Method POST `
  -Uri "http://localhost:8000/api/v1/auth/otp/verify" `
  -Headers @{"Content-Type"="application/json"} `
  -Body (@{email="test@example.com"; code=$otp} | ConvertTo-Json)

$token = $response.access_token
Write-Host "Access Token: $token"
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

- [ ] Received access_token
- [ ] Received refresh_token
- [ ] Tokens are valid JWT format

**Verify User Created:**
```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "SELECT id, email, is_verified FROM users WHERE email='test@example.com';"
```
- [ ] User exists with is_verified = true

**Verify Plan Assigned:**
```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "SELECT u.email, p.name FROM users u JOIN user_plans up ON u.id = up.user_id JOIN plans p ON up.plan_id = p.id WHERE u.email='test@example.com';"
```
- [ ] User has FREE plan

---

### Test 4: Get Current User Info
```powershell
# Use the token from Test 3
curl -H "Authorization: Bearer $token" `
  http://localhost:8000/api/v1/users/me
```

**Expected Response:**
```json
{
  "id": 1,
  "email": "test@example.com",
  "phone": null,
  "is_active": true,
  "is_verified": true,
  "created_at": "2025-01-01T00:00:00",
  "plan_name": "free",
  "plan_max_emails": 2,
  "plan_max_filters": 5,
  "connected_emails_count": 0,
  "filters_count": 0
}
```

- [ ] User data returned
- [ ] Plan limits shown correctly

---

### Test 5: Get Google OAuth URL
```powershell
curl -H "Authorization: Bearer $token" `
  http://localhost:8000/api/v1/google/auth-url
```

**Expected Response:**
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/auth?..."
}
```

- [ ] Received auth_url
- [ ] URL starts with `https://accounts.google.com/o/oauth2/auth`

**Manual Step:**
1. Copy the `auth_url`
2. Open in browser
3. Complete Google OAuth flow
4. Should redirect to: `http://localhost:8000/api/v1/google/callback?code=...`

- [ ] OAuth flow completed
- [ ] Success message received
- [ ] Gmail account connected

**Verify in Database:**
```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter -c "SELECT id, email_address, is_active FROM connected_emails;"
```
- [ ] Connected email record exists
- [ ] Tokens are encrypted (long random strings)

---

### Test 6: Create Email Filter
```powershell
$filterData = @{
  name = "Important Clients"
  filter_type = "sender"
  conditions = @{
    sender = "important@client.com"
  }
  action_type = "notify"
  priority = 10
} | ConvertTo-Json

curl -X POST http://localhost:8000/api/v1/filters `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d $filterData
```

**Expected Response:**
```json
{
  "id": 1,
  "user_id": 1,
  "name": "Important Clients",
  "filter_type": "sender",
  "conditions": {
    "sender": "important@client.com"
  },
  "action_type": "notify",
  "priority": 10,
  "is_active": true,
  "match_count": 0,
  "created_at": "...",
  "updated_at": "..."
}
```

- [ ] Filter created successfully
- [ ] ID assigned
- [ ] Conditions saved correctly

**Test Subject Filter:**
```powershell
$subjectFilter = @{
  name = "Urgent Emails"
  filter_type = "subject"
  conditions = @{
    subject_contains = "URGENT"
  }
  action_type = "notify"
  priority = 20
} | ConvertTo-Json

curl -X POST http://localhost:8000/api/v1/filters `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d $subjectFilter
```

- [ ] Second filter created

---

### Test 7: List Filters
```powershell
curl -H "Authorization: Bearer $token" `
  http://localhost:8000/api/v1/filters
```

**Expected Response:**
```json
[
  {
    "id": 2,
    "name": "Urgent Emails",
    "priority": 20,
    ...
  },
  {
    "id": 1,
    "name": "Important Clients",
    "priority": 10,
    ...
  }
]
```

- [ ] Both filters returned
- [ ] Ordered by priority (20 before 10)

---

### Test 8: Update Filter
```powershell
$updateData = @{
  name = "VIP Clients"
  priority = 30
} | ConvertTo-Json

curl -X PATCH http://localhost:8000/api/v1/filters/1 `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d $updateData
```

**Expected:**
- [ ] Filter updated
- [ ] New name reflected
- [ ] Priority changed

---

### Test 9: Get User Stats
```powershell
curl -H "Authorization: Bearer $token" `
  http://localhost:8000/api/v1/users/me/stats
```

**Expected Response:**
```json
{
  "total_filtered_emails": 0,
  "unread_emails": 0,
  "emails_today": 0,
  "active_filters": 2,
  "connected_emails": 1
}
```

- [ ] Correct filter count (2)
- [ ] Correct connected email count (1)

---

### Test 10: Test Plan Limits

**Create 3 more filters (FREE plan allows 5):**
```powershell
# Create filter 3
$filter3 = @{name="Filter 3"; filter_type="sender"; conditions=@{sender="test3@test.com"}; action_type="notify"} | ConvertTo-Json
curl -X POST http://localhost:8000/api/v1/filters -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d $filter3

# Create filter 4
$filter4 = @{name="Filter 4"; filter_type="sender"; conditions=@{sender="test4@test.com"}; action_type="notify"} | ConvertTo-Json
curl -X POST http://localhost:8000/api/v1/filters -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d $filter4

# Create filter 5
$filter5 = @{name="Filter 5"; filter_type="sender"; conditions=@{sender="test5@test.com"}; action_type="notify"} | ConvertTo-Json
curl -X POST http://localhost:8000/api/v1/filters -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d $filter5
```

- [ ] All 3 created successfully (total = 5)

**Try to create 6th filter (should fail):**
```powershell
$filter6 = @{name="Filter 6"; filter_type="sender"; conditions=@{sender="test6@test.com"}; action_type="notify"} | ConvertTo-Json
curl -X POST http://localhost:8000/api/v1/filters -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d $filter6
```

**Expected:**
```json
{
  "detail": "Plan limit reached. Maximum 5 filters allowed."
}
```
- [ ] HTTP 403 Forbidden
- [ ] Correct error message

---

### Test 11: Webhook Endpoint

```powershell
# Simulate Gmail Pub/Sub notification
$webhookData = @{
  message = @{
    data = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((@{
      emailAddress = "your-gmail@gmail.com"
      historyId = "12345"
    } | ConvertTo-Json)))
    messageId = "test-123"
  }
} | ConvertTo-Json -Depth 5

curl -X POST http://localhost:8000/api/v1/webhooks/gmail `
  -H "Content-Type: application/json" `
  -d $webhookData
```

**Expected:**
- [ ] HTTP 200 OK
- [ ] Response: `{"status": "queued", ...}` or similar

**Check Celery logs:**
```powershell
docker-compose logs celery_worker
```
- [ ] Should see processing attempt

---

### Test 12: List Filtered Emails
```powershell
curl -H "Authorization: Bearer $token" `
  "http://localhost:8000/api/v1/emails?page=1&page_size=20"
```

**Expected:**
```json
{
  "total": 0,
  "page": 1,
  "page_size": 20,
  "items": []
}
```

- [ ] Pagination works
- [ ] Empty list (no emails processed yet)

---

### Test 13: Token Refresh
```powershell
# Get refresh token from Test 3
$refreshData = @{
  refresh_token = $response.refresh_token
} | ConvertTo-Json

curl -X POST http://localhost:8000/api/v1/auth/refresh `
  -H "Content-Type: application/json" `
  -d $refreshData
```

**Expected:**
- [ ] New access_token received
- [ ] New refresh_token received

---

### Test 14: Rate Limiting

**Request OTP 4 times rapidly:**
```powershell
1..4 | ForEach-Object {
  curl -X POST http://localhost:8000/api/v1/auth/otp/request `
    -H "Content-Type: application/json" `
    -d '{\"email\": \"ratelimit@test.com\"}'
  Start-Sleep -Milliseconds 500
}
```

**Expected:**
- [ ] First 3 requests succeed
- [ ] 4th request: HTTP 429 (Too Many Requests)
- [ ] Error: "Too many OTP requests. Please try again later."

---

## 🔍 Redis Verification

```powershell
# Connect to Redis
docker-compose exec redis redis-cli

# Check OTP keys
KEYS otp:*

# Check user sessions
KEYS user_session:*

# Check cached filters
KEYS user_filters:*

# Exit
EXIT
```

- [ ] OTP keys exist and expire
- [ ] Session keys present
- [ ] TTL values set correctly

---

## 📊 Database Verification

```powershell
docker-compose exec postgres psql -U emailfilter -d emailfilter
```

**Run these queries:**

```sql
-- All tables exist
\dt

-- Users count
SELECT COUNT(*) FROM users;

-- Plans
SELECT * FROM plans;

-- User plans
SELECT u.email, p.name FROM users u
JOIN user_plans up ON u.id = up.user_id
JOIN plans p ON up.plan_id = p.id;

-- Filters
SELECT u.email, ef.name, ef.filter_type FROM email_filters ef
JOIN users u ON ef.user_id = u.id;

-- Connected emails (tokens should be encrypted)
SELECT id, email_address, LENGTH(access_token_encrypted) as token_length
FROM connected_emails;

-- Exit
\q
```

- [ ] All tables present
- [ ] Data looks correct
- [ ] Tokens are encrypted (long strings)

---

## 🌸 Flower (Celery Monitor)

1. Open http://localhost:5555
2. Check:
   - [ ] Flower dashboard loads
   - [ ] Workers tab shows 1 active worker
   - [ ] Tasks tab shows task history
   - [ ] No failed tasks

---

## 📝 API Documentation

1. Open http://localhost:8000/docs
2. Verify:
   - [ ] Swagger UI loads
   - [ ] All endpoints visible
   - [ ] Schemas documented
   - [ ] "Try it out" works

---

## 🐛 Common Issues & Fixes

### Issue: "Can't connect to database"
```powershell
docker-compose restart postgres
docker-compose logs postgres
```

### Issue: "Redis connection error"
```powershell
docker-compose restart redis
docker-compose exec redis redis-cli ping  # Should return PONG
```

### Issue: "Celery worker not processing"
```powershell
docker-compose restart celery_worker
docker-compose logs -f celery_worker
```

### Issue: "Migration errors"
```powershell
# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d postgres redis
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_db.py
```

### Issue: "OTP not appearing in logs"
```powershell
# Check backend logs
docker-compose logs -f backend | Select-String "OTP"

# Verify SMTP settings in .env
```

---

## ✅ Final Checklist

Before considering MVP complete:

- [ ] All API endpoints tested
- [ ] Authentication flow works
- [ ] Google OAuth connects Gmail
- [ ] Filters can be created/updated/deleted
- [ ] Plan limits enforced
- [ ] Rate limiting works
- [ ] Webhook receives notifications
- [ ] Celery processes tasks
- [ ] Database persists data
- [ ] Redis caches correctly
- [ ] Documentation complete
- [ ] No critical errors in logs

---

## 🎉 Success!

If all tests pass, you have a working EmailFilter Pro MVP!

**Next Steps:**
1. Connect real Gmail account
2. Create actual filters
3. Send test emails
4. Watch them get filtered!

**For production:**
- Update all secrets in `.env`
- Enable HTTPS
- Setup monitoring (Sentry)
- Deploy to cloud
- Add frontend UI

---

**Questions or issues?** Check logs with:
```powershell
docker-compose logs -f
```

**Happy filtering! 📧✨**
