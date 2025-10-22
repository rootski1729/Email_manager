# WAHA Core Integration Guide

## Overview
WAHA (WhatsApp HTTP API) is a self-hosted WhatsApp API that you can run in Docker. Unlike Twilio (which is a paid SaaS service), WAHA gives you full control over your WhatsApp automation.

## 🎯 Why Switch from Twilio to WAHA?

### Twilio (Current)
- ❌ Paid service ($0.005-$0.01 per message)
- ❌ External dependency
- ❌ Requires WhatsApp Business API approval
- ❌ Limited customization
- ✅ Reliable and well-documented

### WAHA Core (Recommended)
- ✅ **100% FREE** forever
- ✅ Self-hosted (your infrastructure)
- ✅ No message limits
- ✅ Full control over data
- ✅ Works with regular WhatsApp (no business account needed)
- ✅ REST API (easy integration)
- ⚠️ Requires Docker and maintenance

## 🚀 Quick Setup

### 1. Run WAHA Docker Container
```bash
# Basic setup
docker run -it -p 3000:3000 devlikeapro/waha

# With API Key security
docker run -it -p 3000:3000 \
  -e WAHA_API_KEY=yoursecretkey123 \
  devlikeapro/waha

# Production setup with persistence
docker run -d \
  --name waha \
  -p 3000:3000 \
  -e WAHA_API_KEY=sha512:YOUR_HASH_HERE \
  -v $PWD/.sessions:/app/.sessions \
  devlikeapro/waha
```

### 2. Create Session (Connect WhatsApp)
```bash
# Create a session
curl -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: yoursecretkey123' \
  -d '{
    "name": "default"
  }'
```

### 3. Get QR Code
```bash
# Get QR code to scan
curl http://localhost:3000/api/default/auth/qr \
  -H 'X-Api-Key: yoursecretkey123' \
  --output qr.png

# Open qr.png and scan with WhatsApp
```

### 4. Send Test Message
```bash
curl -X POST http://localhost:3000/api/sendText \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: yoursecretkey123' \
  -d '{
    "session": "default",
    "chatId": "1234567890@c.us",
    "text": "Hello from WAHA!"
  }'
```

## 📡 Core API Endpoints

### Session Management
```bash
# Create session
POST /api/sessions
Body: {"name": "default"}

# Get QR code
GET /api/{session}/auth/qr

# Check session status
GET /api/sessions/{session}

# Stop session
POST /api/sessions/{session}/stop

# Logout session
POST /api/sessions/{session}/logout
```

### Sending Messages
```bash
# Send text message
POST /api/sendText
Body: {
  "session": "default",
  "chatId": "1234567890@c.us",
  "text": "Hello!"
}

# Send image
POST /api/sendImage
Body: {
  "session": "default",
  "chatId": "1234567890@c.us",
  "file": {
    "mimetype": "image/jpeg",
    "url": "https://example.com/image.jpg",
    "filename": "image.jpg"
  },
  "caption": "Check this out!"
}

# Send file/document
POST /api/sendFile
Body: {
  "session": "default",
  "chatId": "1234567890@c.us",
  "file": {
    "mimetype": "application/pdf",
    "url": "https://example.com/document.pdf",
    "filename": "document.pdf"
  },
  "caption": "Here's the document"
}

# Send location
POST /api/sendLocation
Body: {
  "session": "default",
  "chatId": "1234567890@c.us",
  "latitude": 38.8937255,
  "longitude": -77.0969763,
  "title": "Our office"
}
```

## 🔐 Authentication

### Phone Number Format
WhatsApp uses specific format: `{country_code}{phone_number}@c.us`

Examples:
- US: `+1 (213) 213-2130` → `12132132130@c.us`
- India: `+91 98765 43210` → `919876543210@c.us`
- UK: `+44 7700 900123` → `447700900123@c.us`

### API Key Authentication
```bash
# Set in Docker
-e WAHA_API_KEY=yoursecretkey123

# Use in all requests
-H 'X-Api-Key: yoursecretkey123'
```

### Secure API Key (Production)
```bash
# Generate key
uuidgen | tr -d '-'
# Output: 00000000000000000000000000000000

# Hash it
echo -n "00000000000000000000000000000000" | shasum -a 512
# Output: 98b6d128682e280b74b324ca82a6bae6...

# Set in Docker
-e WAHA_API_KEY=sha512:98b6d128682e280b74b324ca82a6bae6...

# Use original key in requests
-H 'X-Api-Key: 00000000000000000000000000000000'
```

## 🔄 Webhooks (Receive Messages)

### Configure Webhook on Session
```json
{
  "name": "default",
  "config": {
    "webhooks": [
      {
        "url": "https://yourserver.com/webhook",
        "events": ["message", "message.any"]
      }
    ]
  }
}
```

### Webhook Event Structure
```json
{
  "event": "message",
  "session": "default",
  "payload": {
    "id": "true_123@c.us_AAA",
    "timestamp": 1234567890,
    "from": "123@c.us",
    "fromMe": false,
    "body": "Hello!",
    "hasMedia": false,
    "ack": 1,
    "vCards": [],
    "_data": {...}
  }
}
```

## 🐍 Python Integration Example

### Install httpx
```bash
pip install httpx phonenumbers
```

### Python Service Class
```python
import httpx
import phonenumbers
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class WAHAService:
    """WhatsApp service using WAHA (WhatsApp HTTP API)"""
    
    def __init__(self):
        self.base_url = "http://localhost:3000/api"
        self.api_key = "yoursecretkey123"
        self.session = "default"
        self.headers = {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json"
        }
    
    def format_phone_number(self, phone_number: str) -> str:
        """
        Convert phone number to WhatsApp format
        +1 (213) 213-2130 -> 12132132130@c.us
        """
        try:
            parsed = phonenumbers.parse(phone_number, None)
            if phonenumbers.is_valid_number(parsed):
                # Format as international without + or spaces
                number = phonenumbers.format_number(
                    parsed, 
                    phonenumbers.PhoneNumberFormat.E164
                )[1:]  # Remove leading +
                return f"{number}@c.us"
        except Exception as e:
            logger.error(f"Error formatting phone: {e}")
        return None
    
    async def send_text(
        self,
        phone_number: str,
        message: str
    ) -> Tuple[bool, Optional[str]]:
        """Send text message via WAHA"""
        chat_id = self.format_phone_number(phone_number)
        if not chat_id:
            return False, "Invalid phone number"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/sendText",
                    headers=self.headers,
                    json={
                        "session": self.session,
                        "chatId": chat_id,
                        "text": message
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    logger.info(f"Message sent to {phone_number}")
                    return True, None
                else:
                    error = response.json().get("message", "Unknown error")
                    logger.error(f"Failed to send: {error}")
                    return False, error
                    
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            return False, str(e)
    
    async def check_session_status(self) -> dict:
        """Check if session is working"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/sessions/{self.session}",
                    headers=self.headers
                )
                return response.json()
        except Exception as e:
            logger.error(f"Error checking session: {e}")
            return {"status": "FAILED", "error": str(e)}


# Global instance
waha_service = WAHAService()
```

## 🔄 Migration from Twilio

### Current Code (Twilio)
```python
from twilio.rest import Client

client = Client(account_sid, auth_token)
message = client.messages.create(
    from_='whatsapp:+14155238886',
    body='Hello!',
    to='whatsapp:+15551234567'
)
```

### New Code (WAHA)
```python
import httpx

async def send_whatsapp(phone: str, message: str):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:3000/api/sendText",
            headers={"X-Api-Key": "yoursecretkey123"},
            json={
                "session": "default",
                "chatId": f"{phone.replace('+', '')}@c.us",
                "text": message
            }
        )
    return response.json()
```

## 📊 Feature Comparison

| Feature | Twilio | WAHA Core | WAHA Plus |
|---------|--------|-----------|-----------|
| **Cost** | Paid per message | FREE | One-time payment |
| **Text Messages** | ✅ | ✅ | ✅ |
| **Images** | ✅ | ✅ | ✅ |
| **Videos** | ✅ | ✅ | ✅ |
| **Documents** | ✅ | ✅ | ✅ |
| **Location** | ✅ | ✅ | ✅ |
| **Voice Messages** | ✅ | ✅ | ✅ |
| **Multiple Sessions** | ✅ | ❌ (1 only) | ✅ (Unlimited) |
| **Webhooks** | ✅ | ✅ | ✅ |
| **Groups** | ❌ | ✅ | ✅ |
| **Status/Stories** | ❌ | ✅ | ✅ |
| **Polls** | ❌ | ✅ | ✅ |

## 🛠️ Configuration Options

### Environment Variables
```bash
# API Configuration
WAHA_API_KEY=yoursecretkey123
WHATSAPP_API_PORT=3000

# Webhooks
WHATSAPP_HOOK_URL=https://yourserver.com/webhook
WHATSAPP_HOOK_EVENTS=message,message.any

# Session Persistence
WHATSAPP_FILES_FOLDER=/app/.sessions

# Logging
WAHA_LOG_LEVEL=info
WAHA_LOG_FORMAT=PRETTY

# Download media
WHATSAPP_DOWNLOAD_MEDIA=true
```

### Docker Compose Example
```yaml
version: '3.8'

services:
  waha:
    image: devlikeapro/waha
    container_name: waha
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - WAHA_API_KEY=yoursecretkey123
      - WHATSAPP_HOOK_URL=http://backend:8000/api/v1/webhooks/waha
      - WHATSAPP_HOOK_EVENTS=message,message.any
      - WAHA_LOG_LEVEL=info
    volumes:
      - ./waha_sessions:/app/.sessions
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

## 🎯 Integration Steps for EmailFilter Pro

### 1. Update Docker Compose
Add WAHA service to your `docker-compose.yml`:
```yaml
waha:
  image: devlikeapro/waha
  container_name: waha
  restart: unless-stopped
  ports:
    - "3000:3000"
  environment:
    - WAHA_API_KEY=${WAHA_API_KEY}
    - WHATSAPP_HOOK_URL=http://backend:8000/api/v1/webhooks/waha
  volumes:
    - ./waha_sessions:/app/.sessions
  networks:
    - app-network
```

### 2. Update Environment Variables
Add to your `.env`:
```bash
# WAHA Configuration
WAHA_API_URL=http://waha:3000/api
WAHA_API_KEY=yoursecretkey123
WAHA_SESSION_NAME=default
```

### 3. Create New WhatsApp Service
Replace `whatsapp_service.py` with WAHA integration.

### 4. Update Phone Verification
- Keep OTP generation in Redis (same as now)
- Replace Twilio send with WAHA send

### 5. Update Filter Notifications
- Replace Twilio notification with WAHA sendText
- Format phone numbers to WhatsApp format

## ⚠️ Important Considerations

### Pros
1. **FREE** - No per-message costs
2. **Self-hosted** - Full control
3. **No limits** - Send unlimited messages
4. **Feature-rich** - Groups, status, polls, etc.
5. **Easy to use** - Simple REST API

### Cons
1. **Maintenance** - You manage the infrastructure
2. **Blocking risk** - WhatsApp may block if you spam
3. **QR code** - Need to scan QR periodically
4. **Single session** - Core version supports 1 session only
5. **Not official** - Uses WhatsApp Web (not official API)

### Best Practices
1. **Don't spam** - Respect WhatsApp's limits
2. **Use delays** - Don't send too fast
3. **Save sessions** - Persist sessions to avoid re-scanning QR
4. **Monitor status** - Check session health regularly
5. **Fallback** - Keep console logging as backup

## 📖 Resources

- **Documentation**: https://waha.devlike.pro/docs/
- **GitHub**: https://github.com/devlikeapro/waha
- **Docker Hub**: https://hub.docker.com/r/devlikeapro/waha
- **Swagger API**: http://localhost:3000/swagger (after running)
- **Dashboard**: http://localhost:3000/dashboard (Plus version)

## 🎬 Next Steps

1. ✅ Review this guide
2. ⏳ Test WAHA locally with Docker
3. ⏳ Create new `WAHAService` class
4. ⏳ Update phone verification flow
5. ⏳ Update filter notification flow
6. ⏳ Test end-to-end
7. ⏳ Deploy to production

---

**Status**: Ready to implement
**Estimated Time**: 2-3 hours for full migration
**Difficulty**: Medium (requires Docker knowledge)
