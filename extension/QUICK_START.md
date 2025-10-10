# 🚀 Quick Start Guide - EmailFilter Pro Extension

## 📋 Prerequisites

✅ Chrome browser installed  
✅ Backend server running on `http://localhost:8000`  
✅ Redis running (for caching)  
✅ PostgreSQL database set up  

## ⚡ 5-Minute Setup

### Step 1: Start Backend

```powershell
# Terminal 1: Start backend
cd D:\Rahul_work\Drive_manager\backend
.\venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

```powershell
# Terminal 2: Start Redis (if using Docker)
cd D:\Rahul_work\Drive_manager\backend
docker-compose up redis
```

Verify backend is running:
```
✓ Open http://localhost:8000/docs
✓ Should see FastAPI Swagger UI
```

### Step 2: Load Extension

1. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - OR: Menu → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle switch in top-right corner

3. **Load Extension**
   - Click "Load unpacked" button
   - Navigate to `D:\Rahul_work\Drive_manager\extension`
   - Click "Select Folder"

4. **Pin Extension**
   - Click puzzle icon in Chrome toolbar
   - Find "EmailFilter Pro"
   - Click pin icon 📌

### Step 3: First Login

1. **Click Extension Icon**
   - Should see purple login screen

2. **Enter Your Email**
   ```
   your-email@gmail.com
   ```
   - Click "Send OTP"

3. **Check Email**
   - You'll receive a 6-digit code
   - Valid for 2 minutes

4. **Enter OTP**
   - Type the 6-digit code
   - Click "Verify & Login"

5. **Success!**
   - You'll see the dashboard
   - Default stats will show

### Step 4: Connect Gmail

1. **Go to Settings Tab**
   - Click "Settings" in bottom nav

2. **Connect Gmail Account**
   - Click "Connect Gmail Account"
   - New tab opens with Google OAuth

3. **Authorize Access**
   - Select your Gmail account
   - Grant permissions:
     - Read emails
     - Modify emails
     - View email address

4. **Success Confirmation**
   - Popup shows "Successfully connected!"
   - Account appears in Connected Accounts list

### Step 5: View Emails

1. **Go to Emails Tab**
   - Click "Emails" in nav

2. **Select Inbox** (optional)
   - Dropdown shows all connected accounts
   - Select specific inbox or "All Inboxes"

3. **Browse Emails**
   - Scroll through email list
   - Click any email to view details
   - Click "Load More" for pagination

## 🎯 Quick Actions

### View Email Details
```
Emails Tab → Click any email card → Detail modal opens
```

### Search Emails
```
Emails Tab → Type in search box → Press Enter
```

### Switch Inboxes
```
Emails Tab → Inbox dropdown → Select account
```

### Create Filter
```
Filters Tab → Click "Create New Filter" → (Coming soon)
```

### Logout
```
Settings Tab → Click "Sign Out"
OR
Dashboard Header → Click logout icon
```

## 🐛 Troubleshooting

### Extension Not Loading

**Error**: "Manifest file is missing or unreadable"

**Fix**:
```powershell
# Check manifest.json exists
ls D:\Rahul_work\Drive_manager\extension\manifest.json

# Reload extension
chrome://extensions → Click reload icon
```

### Login Not Working

**Error**: "Failed to send OTP"

**Fix**:
```powershell
# Check backend is running
curl http://localhost:8000/docs

# Check SMTP settings in backend/.env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### No Emails Loading

**Error**: "Failed to load emails"

**Checks**:
1. Is backend running? → `http://localhost:8000/docs`
2. Is Redis running? → Check docker container
3. Gmail connected? → Settings → Connected Accounts
4. Check browser console → Right-click extension → Inspect

### Token Expired

**Error**: "Session expired. Please login again."

**Fix**:
- Extension auto-refreshes tokens
- If persists: Logout → Login again
- Check refresh token in Chrome storage:
  ```javascript
  chrome://extensions → Service Worker → Console
  chrome.storage.local.get(['refreshToken'])
  ```

### Gmail OAuth Not Working

**Error**: "Failed to connect Gmail"

**Checks**:
1. Backend `.env` has correct Google credentials:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/google/callback
   ```

2. Google Cloud Console:
   - OAuth 2.0 Client ID created
   - Redirect URI matches backend
   - APIs enabled: Gmail API, Google+ API

## 🔍 Debug Mode

### View Popup Console
```
Right-click extension icon → Inspect popup → Console tab
```

### View Background Console
```
chrome://extensions → EmailFilter Pro → Service worker → Inspect
```

### Check Storage
```javascript
// In popup console
chrome.storage.local.get(null, (data) => console.log(data));
```

### Force Sync
```javascript
// In popup console
chrome.runtime.sendMessage({ action: 'forceSync' });
```

## 📊 API Testing

### Test OTP Send
```powershell
curl -X POST http://localhost:8000/api/v1/auth/otp/request `
  -H "Content-Type: application/json" `
  -d '{"email":"test@example.com"}'
```

### Test OTP Verify
```powershell
curl -X POST http://localhost:8000/api/v1/auth/otp/verify `
  -H "Content-Type: application/json" `
  -d '{"email":"test@example.com","code":"123456"}'
```

### Test Email Fetch (with token)
```powershell
$token = "your-access-token"
curl http://localhost:8000/api/v1/gmail-emails/all?page=1&page_size=20 `
  -H "Authorization: Bearer $token"
```

## 🎨 Customization

### Change API URL

**File**: `extension/popup/popup.js`
```javascript
// Line 2
const API_BASE_URL = 'https://your-api.com/api/v1';
```

**File**: `extension/background/service-worker.js`
```javascript
// Line 4
const API_BASE_URL = 'https://your-api.com/api/v1';
```

### Change Sync Interval

**File**: `extension/background/service-worker.js`
```javascript
// Line 6
chrome.alarms.create('emailSync', { 
  periodInMinutes: 10  // Change from 5 to 10 minutes
});
```

### Disable Notifications

**In Extension**:
```
Settings Tab → (Coming soon: Notification toggle)
```

**Manually**:
```javascript
// background/service-worker.js
// Comment out lines 67-75 (notifyFilteredEmails function calls)
```

## 📱 Mobile Testing (Optional)

Currently desktop-only, but you can test on mobile Chrome:

1. Use ngrok to expose localhost:
   ```powershell
   ngrok http 8000
   ```

2. Update API_BASE_URL to ngrok URL:
   ```javascript
   const API_BASE_URL = 'https://abc123.ngrok.io/api/v1';
   ```

3. Load extension on desktop Chrome
4. Test from mobile by navigating to backend endpoints

## 🎓 Learning Resources

### Chrome Extension APIs
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Alarms API](https://developer.chrome.com/docs/extensions/reference/alarms/)

### FastAPI Backend
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [SQLAlchemy Async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)

### Gmail API
- [Gmail API Docs](https://developers.google.com/gmail/api)
- [OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)

## ✅ Success Checklist

After setup, verify everything works:

- [ ] Extension loads without errors
- [ ] Login with email OTP works
- [ ] Dashboard shows user info
- [ ] Can connect Gmail account
- [ ] Emails load from connected inbox
- [ ] Can view email details
- [ ] Can switch between inboxes
- [ ] Background sync runs (check after 5 min)
- [ ] Notifications work (when filter matches)
- [ ] Logout works
- [ ] Re-login persists session

## 🚀 Next Steps

1. **Create Your First Filter**
   - Go to Filters tab
   - Click "Create New Filter"
   - Set up rules to match emails

2. **Test Filter Notifications**
   - Send yourself a test email matching filter
   - Wait for sync (max 5 minutes)
   - Check for notification

3. **Explore Advanced Features**
   - Multiple Gmail accounts
   - Complex filter rules
   - Email search

---

**Need Help?** Check the main README.md or open an issue on GitHub!

Happy filtering! 📧✨
