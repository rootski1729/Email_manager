# ✅ OTP Implementation - Redis Only (Fixed)

## Problem Identified

The previous implementation was **INCORRECT**:
- ❌ OTP stored in **both** Redis AND PostgreSQL database table
- ❌ Used 10-minute expiry instead of 2 minutes
- ❌ Verification checked both Redis and database

## Correct Implementation (Now Fixed)

### ✅ What Changed:

#### 1. **Removed Database Table**
- **File**: `backend/app/models/models.py`
- **Change**: Deleted `OTPCode` model entirely
- **Why**: OTP should ONLY be in Redis (temporary data, not persistent)

#### 2. **Email OTP (Auth Service)**
- **File**: `backend/app/services/auth_service.py`
- **Changes**:
  ```python
  # OLD (Wrong):
  await redis_client.setex(redis_key, 600, "1")  # 10 minutes
  
  # NEW (Correct):
  await redis_client.setex(redis_key, 120, "1")  # 2 minutes
  ```
- **Removed**: All database OTP operations
- **Kept**: Only Redis operations

#### 3. **Phone OTP (WhatsApp Service)**
- **File**: `backend/app/services/whatsapp_service.py`
- **Changes**:
  ```python
  # OLD (Wrong):
  await redis_manager.set(redis_key, "1", expire=600)  # 10 minutes
  
  # NEW (Correct):
  await redis_manager.set(redis_key, "1", expire=120)  # 2 minutes
  ```

---

## Current OTP Flow (Correct)

### 📧 Email OTP Flow:

**Step 1: Request OTP**
```http
POST /api/v1/auth/otp/request
{
  "email": "user@example.com"
}
```

**Backend Process:**
1. Generate 6-digit OTP code
2. Store in Redis: `otp:user@example.com:123456` → TTL: 120 seconds
3. Rate limit: Max 3 OTPs per 15 minutes (also in Redis)
4. Send OTP via email (logged to console in MVP)

**Step 2: Verify OTP**
```http
POST /api/v1/auth/otp/verify
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Backend Process:**
1. Check Redis key: `otp:user@example.com:123456`
2. If exists → Valid ✅
3. If not exists → Invalid/Expired ❌
4. Delete key from Redis (one-time use)
5. Create/fetch user and return JWT tokens

---

### 📱 Phone OTP Flow (WhatsApp):

**Step 1: Request Phone OTP**
```http
POST /api/v1/phone/request-verification
{
  "phone_number": "+1234567890"
}
```

**Backend Process:**
1. Validate phone number format (E.164)
2. Generate 6-digit OTP
3. Store in Redis: `phone_otp:+1234567890:123456` → TTL: 120 seconds
4. Send OTP via WhatsApp (Twilio API)

**Step 2: Verify Phone OTP**
```http
POST /api/v1/phone/verify
{
  "phone_number": "+1234567890",
  "code": "123456"
}
```

**Backend Process:**
1. Check Redis key: `phone_otp:+1234567890:123456`
2. If exists → Valid ✅
3. If not exists → Invalid/Expired ❌
4. Delete key from Redis
5. Mark user's `phone_verified = True` in database

---

## Redis Keys Structure

### Email OTP Keys:
```redis
# OTP storage (2-minute TTL)
otp:{email}:{code} → "1"
Example: otp:user@example.com:123456 → "1" (TTL: 120s)

# Rate limiting (15-minute TTL)
otp_rate_limit:{email} → counter
Example: otp_rate_limit:user@example.com → "2" (TTL: 900s)
```

### Phone OTP Keys:
```redis
# Phone OTP storage (2-minute TTL)
phone_otp:{phone_number}:{code} → "1"
Example: phone_otp:+1234567890:123456 → "1" (TTL: 120s)
```

---

## Benefits of Redis-Only Implementation

✅ **Performance**: In-memory storage (microsecond latency)  
✅ **Automatic Expiry**: TTL built-in, no cleanup needed  
✅ **Simplicity**: No database migrations for OTP table  
✅ **Scalability**: Redis handles millions of keys easily  
✅ **Security**: Auto-expires in 2 minutes, one-time use  

---

## Testing Redis OTP

### 1. Check Redis Connection:
```powershell
docker-compose exec redis redis-cli ping
# Should return: PONG
```

### 2. Monitor OTP Creation:
```powershell
# Terminal 1: Watch Redis keys
docker-compose exec redis redis-cli MONITOR

# Terminal 2: Request OTP
curl -X POST http://localhost:8000/api/v1/auth/otp/request `
  -H "Content-Type: application/json" `
  -d '{"email": "test@example.com"}'

# Terminal 1 will show:
# SETEX otp:test@example.com:123456 120 "1"
```

### 3. Check OTP in Redis:
```powershell
docker-compose exec redis redis-cli
> KEYS otp:*
# Shows all OTP keys

> TTL otp:test@example.com:123456
# Shows remaining seconds (e.g., 115)

> GET otp:test@example.com:123456
# Returns: "1"
```

### 4. Verify OTP Expiry:
```powershell
# Wait 2 minutes, then check:
> GET otp:test@example.com:123456
# Returns: (nil) - Key has expired
```

---

## Configuration

### .env Settings:
```env
# Redis Configuration
REDIS_URL=redis://localhost:6379/0
REDIS_SESSION_DB=1
REDIS_CACHE_DB=2
REDIS_CELERY_DB=3

# OTP is stored in default DB (0) with 2-minute TTL
```

---

## Summary

| Aspect | Before (Wrong) | After (Correct) |
|--------|----------------|-----------------|
| **Storage** | Redis + Database | Redis Only ✅ |
| **Expiry** | 10 minutes | 2 minutes ✅ |
| **Verification** | Check both sources | Check Redis only ✅ |
| **Cleanup** | Manual DB cleanup needed | Auto-expires ✅ |
| **Performance** | Slower (DB queries) | Faster (Redis only) ✅ |
| **Code Complexity** | Higher (2 sources) | Lower (1 source) ✅ |

---

**Implementation Status**: ✅ **COMPLETE**

All OTP operations now use **Redis only** with **2-minute expiry** as requested! 🎉
