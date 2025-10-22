# WAHA Migration Complete! 🎉

## ✅ Changes Made

### 1. Updated Configuration (`app/core/config.py`)
- ✅ Added WAHA settings: `WAHA_API_URL`, `WAHA_API_KEY`, `WAHA_SESSION_NAME`
- ✅ Kept Twilio settings as deprecated (for backward compatibility)

### 2. Rewrote WhatsApp Service (`app/services/whatsapp_service.py`)
- ✅ Replaced Twilio client with WAHA HTTP client (using `httpx`)
- ✅ Added phone number format conversion (E.164 → WhatsApp format)
- ✅ Implemented new methods:
  - `send_text()` - Send text messages
  - `send_image()` - Send images with captions
  - `send_file()` - Send documents/PDFs
  - `check_session_status()` - Monitor WAHA session health
  - `format_phone_to_whatsapp()` - Convert phone numbers to `123@c.us` format
- ✅ Kept existing methods: `send_phone_otp()`, `send_filter_notification()`, `verify_phone_otp()`
- ✅ Added console fallback for development (when WAHA not configured)

### 3. Updated Dependencies (`requirements.txt`)
- ✅ Commented out `twilio==9.0.4` (no longer needed)
- ✅ Kept `httpx==0.26.0` (already present, used for WAHA API calls)
- ✅ Kept `phonenumbers==8.13.27` (still needed for phone validation)

### 4. Updated Environment Example (`.env.example`)
- ✅ Added WAHA configuration section
- ✅ Marked Twilio as deprecated

## 🚀 Setup Instructions

### Step 1: Run WAHA Docker Container

#### Option A: Quick Start (Development)
```bash
# Run WAHA with basic setup
docker run -d \
  --name waha \
  -p 3000:3000 \
  -e WAHA_API_KEY=your-secret-key-123 \
  devlikeapro/waha
```

#### Option B: Production Setup (Recommended)
```bash
# Run WAHA with session persistence
docker run -d \
  --name waha \
  --restart unless-stopped \
  -p 3000:3000 \
  -e WAHA_API_KEY=your-secret-key-123 \
  -v $(pwd)/waha_sessions:/app/.sessions \
  devlikeapro/waha
```

#### Option C: Add to docker-compose.yml
```yaml
services:
  # ... your existing services ...
  
  waha:
    image: devlikeapro/waha
    container_name: waha
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - WAHA_API_KEY=${WAHA_API_KEY}
      - WHATSAPP_HOOK_URL=http://backend:8000/api/v1/webhooks/waha
      - WHATSAPP_HOOK_EVENTS=message,message.any
      - WAHA_LOG_LEVEL=info
    volumes:
      - ./waha_sessions:/app/.sessions
    networks:
      - app-network
```

### Step 2: Update Your .env File
```bash
# Add these to your .env file
WAHA_API_URL=http://localhost:3000/api
WAHA_API_KEY=your-secret-key-123
WAHA_SESSION_NAME=default

# Optional: Comment out Twilio (no longer needed)
# TWILIO_ACCOUNT_SID=...
# TWILIO_AUTH_TOKEN=...
```

### Step 3: Scan QR Code to Connect WhatsApp

#### Method 1: Using Browser
1. Open http://localhost:3000/dashboard in your browser
2. Click on "Sessions" → "Create Session"
3. Scan the QR code with WhatsApp on your phone

#### Method 2: Using API
```bash
# Create session
curl -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: your-secret-key-123' \
  -d '{"name": "default"}'

# Get QR code
curl http://localhost:3000/api/default/auth/qr \
  -H 'X-Api-Key: your-secret-key-123' \
  --output qr.png

# Open qr.png and scan with WhatsApp
```

#### Method 3: Check Terminal Logs
```bash
# WAHA prints QR code to console by default
docker logs waha
```

### Step 4: Test the Integration

#### Test 1: Check WAHA Session Status
```bash
curl http://localhost:3000/api/sessions/default \
  -H 'X-Api-Key: your-secret-key-123'

# Expected response:
# {
#   "name": "default",
#   "status": "WORKING",  # Should be "WORKING" after scanning QR
#   "me": {
#     "id": "1234567890@c.us",
#     "pushName": "Your Name"
#   }
# }
```

#### Test 2: Send Test Message via WAHA
```bash
curl -X POST http://localhost:3000/api/sendText \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: your-secret-key-123' \
  -d '{
    "session": "default",
    "chatId": "1234567890@c.us",
    "text": "Test from WAHA!"
  }'
```

#### Test 3: Test Phone OTP Flow
```python
# In your FastAPI app, test the phone verification endpoint
# POST /api/v1/phone/request-code
# It will use the new WAHA service automatically
```

### Step 5: Restart Your Backend
```bash
# Stop backend
docker-compose down backend

# Install updated requirements (if needed)
pip install -r requirements.txt

# Restart backend
docker-compose up -d backend
```

## 📊 Feature Comparison

| Feature | Old (Twilio) | New (WAHA) |
|---------|--------------|------------|
| **Cost** | $0.005-$0.01/msg | **FREE** |
| **Setup** | Account + API Keys | Docker + QR Scan |
| **Text Messages** | ✅ | ✅ |
| **Images** | ✅ | ✅ |
| **Files/Documents** | ✅ | ✅ |
| **Voice Messages** | ✅ | ✅ |
| **Location** | ✅ | ✅ |
| **Groups** | ❌ | ✅ |
| **Status/Stories** | ❌ | ✅ |
| **Message Limits** | Rate limited | No limits |
| **Data Privacy** | External SaaS | Self-hosted |

## 🔧 How It Works

### Phone Number Format Conversion
```python
# Input: E.164 format (from your database)
phone = "+1 (213) 213-2130"

# WAHA requires: WhatsApp chat ID format
chat_id = "12132132130@c.us"

# Conversion is automatic in whatsapp_service.py
formatted = whatsapp_service.format_phone_to_whatsapp(phone)
# Returns: "12132132130@c.us"
```

### API Call Flow
```
Your App → whatsapp_service.send_text()
  ↓
  Formats phone: "+12132132130" → "12132132130@c.us"
  ↓
  HTTP POST to WAHA: http://localhost:3000/api/sendText
  ↓
  WAHA → WhatsApp Web → Recipient's Phone
```

### Code Changes
```python
# OLD (Twilio)
from twilio.rest import Client
client = Client(account_sid, auth_token)
message = client.messages.create(
    from_='whatsapp:+14155238886',
    body='Hello!',
    to='whatsapp:+15551234567'
)

# NEW (WAHA) - Automatic!
# No code changes needed! Just update .env
# The service handles everything automatically
await whatsapp_service.send_text(
    phone_number="+15551234567",
    message="Hello!"
)
```

## 🎯 Usage Examples

### Send OTP (Phone Verification)
```python
# This already works - no changes needed!
from app.services import whatsapp_service

# Generate and send OTP
code = await whatsapp_service.generate_phone_otp("+12132132130")
success, error = await whatsapp_service.send_phone_otp("+12132132130", code)

if success:
    print("OTP sent successfully!")
```

### Send Filter Notification
```python
# This already works - no changes needed!
from app.services import whatsapp_service

# Send email filter notification
success, error = await whatsapp_service.send_filter_notification(
    phone_number="+12132132130",
    sender="boss@company.com",
    subject="Urgent: Review this proposal",
    filter_name="Important Emails",
    email_id=123
)
```

### Send Image
```python
# NEW feature! Now available
from app.services import whatsapp_service

success, error = await whatsapp_service.send_image(
    phone_number="+12132132130",
    image_url="https://example.com/screenshot.jpg",
    caption="Check out this screenshot!",
    filename="screenshot.jpg"
)
```

### Send Document/PDF
```python
# NEW feature! Now available
from app.services import whatsapp_service

success, error = await whatsapp_service.send_file(
    phone_number="+12132132130",
    file_url="https://example.com/report.pdf",
    filename="report.pdf",
    mimetype="application/pdf",
    caption="Here's your monthly report"
)
```

## 🐛 Troubleshooting

### Issue 1: "WhatsApp service not configured"
**Solution:** Set `WAHA_API_KEY` in your .env file
```bash
WAHA_API_KEY=your-secret-key-123
```

### Issue 2: "WAHA client not initialized"
**Solution:** Check WAHA is running
```bash
docker ps | grep waha
curl http://localhost:3000/api/sessions
```

### Issue 3: Session status is "SCAN_QR_CODE"
**Solution:** Scan QR code
```bash
# Get QR code
curl http://localhost:3000/api/default/auth/qr \
  -H 'X-Api-Key: your-secret-key-123' \
  --output qr.png

# Or check docker logs
docker logs waha
```

### Issue 4: "Invalid phone number format"
**Solution:** Ensure phone is in E.164 format
```python
# CORRECT ✅
phone = "+12132132130"

# WRONG ❌
phone = "(213) 213-2130"
phone = "213-213-2130"
```

### Issue 5: Session keeps disconnecting
**Solution:** Persist sessions with volume mount
```bash
docker run -d \
  -v $(pwd)/waha_sessions:/app/.sessions \
  devlikeapro/waha
```

### Issue 6: Console fallback messages appear
**Solution:** This is normal during development when WAHA isn't configured
```
📱 [WAHA Not Configured] Message to +1234567890: Your OTP is 123456
```
Set WAHA_API_KEY to use real WhatsApp.

## 📚 Resources

- **WAHA Documentation**: https://waha.devlike.pro/docs/
- **WAHA GitHub**: https://github.com/devlikeapro/waha
- **API Reference**: http://localhost:3000/swagger (after running WAHA)
- **Dashboard**: http://localhost:3000/dashboard

## ✅ Migration Checklist

- [ ] Install Docker (if not already)
- [ ] Run WAHA container
- [ ] Update .env with WAHA settings
- [ ] Scan QR code to connect WhatsApp
- [ ] Test session status (should be "WORKING")
- [ ] Test sending OTP
- [ ] Test filter notifications
- [ ] Restart backend service
- [ ] Monitor logs for any issues
- [ ] (Optional) Remove Twilio credentials from .env

## 🎉 Benefits

1. **FREE** - No more per-message costs
2. **No limits** - Send unlimited messages
3. **More features** - Groups, status, polls, etc.
4. **Self-hosted** - Full control over your data
5. **Better UX** - Richer message formatting
6. **Easy to use** - Same API interface as before

---

**Status**: ✅ Migration Complete
**Next Steps**: Follow setup instructions above
**Support**: Check WAHA docs or create GitHub issue
