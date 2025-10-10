# 📧 EmailFilter Pro - Chrome Extension

> Beautiful, modern Gmail management extension with powerful filtering capabilities

## ✨ Features

### 🎨 Beautiful UI
- **Modern Design**: Clean, gradient-based interface with Tailwind CSS
- **Responsive Layout**: Optimized 420x600px popup
- **Smooth Animations**: Fade-in effects, hover states, smooth transitions
- **Professional Icons**: Font Awesome integration

### 🔐 Secure Authentication
- **Email OTP Login**: Passwordless authentication
- **Phone OTP Support**: Alternative login method
- **Auto Token Refresh**: Seamless session management
- **Secure Storage**: Chrome storage API for tokens

### 📬 Email Management
- **Multi-Inbox Support**: View emails from all connected Gmail accounts
- **Smart Caching**: Redis-powered fast email retrieval
- **Search & Filter**: Quick email search
- **Email Preview**: Beautiful email detail modal
- **Pagination**: Load more functionality

### 🎯 Advanced Filtering
- **Custom Filters**: Create complex email rules
- **Multiple Actions**: Archive, label, forward, delete
- **Real-time Matching**: Instant filter application
- **Filter Statistics**: Track filter performance

### 🔄 Background Sync
- **Auto-Sync**: Periodic email synchronization (every 5 minutes)
- **Push Notifications**: Get notified when emails match filters
- **Smart Refresh**: Only syncs new emails to save bandwidth

## 🚀 Installation

### 1. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension` folder
5. Pin the extension to your toolbar

### 2. Backend Setup

Make sure your backend is running:

```powershell
cd D:\Rahul_work\Drive_manager\backend
uvicorn app.main:app --reload --port 8000
```

### 3. First Time Setup

1. Click the extension icon
2. Sign in with email OTP
3. Connect your Gmail account
4. Start managing emails!

## 📱 Usage Guide

### Login Flow

```
1. Enter email → 2. Receive OTP → 3. Verify OTP → 4. Dashboard
```

### Dashboard Tabs

#### 📧 Emails Tab
- **Inbox Selector**: Switch between connected Gmail accounts or view all
- **Search Bar**: Quick email search
- **Email Cards**: Click to view full email details
- **Load More**: Paginated email loading

#### 🎯 Filters Tab
- **Create Filter**: Set up custom filtering rules
- **Filter List**: View all active/inactive filters
- **Filter Stats**: See how many emails matched

#### ⚙️ Settings Tab
- **Connected Accounts**: Manage Gmail connections
- **Sync Settings**: Enable/disable auto-sync
- **Account Info**: View plan and member details
- **Sign Out**: Logout securely

## 🛠️ Technical Architecture

### Frontend (Extension)
```
extension/
├── manifest.json           # Extension configuration
├── popup/
│   ├── popup.html         # Main UI (Tailwind CSS)
│   └── popup.js           # API client, state management
├── background/
│   └── service-worker.js  # Background sync, notifications
└── icons/                 # Extension icons
```

### API Integration

#### Authentication Flow
```javascript
1. Send OTP     → POST /api/v1/auth/otp/request
2. Verify OTP   → POST /api/v1/auth/otp/verify
3. Get User     → GET  /api/v1/users/me
4. Refresh Token → POST /api/v1/auth/refresh (automatic)
```

#### Email Fetching
```javascript
// All emails from all inboxes (with Redis cache)
GET /api/v1/gmail-emails/all?page=1&page_size=20

// Emails from specific inbox
GET /api/v1/gmail-emails/inbox/:id?page=1&page_size=20

// Single email detail
GET /api/v1/gmail-emails/inbox/:id/message/:messageId
```

#### Token Refresh Strategy
```javascript
// Automatic token refresh on 401 responses
if (response.status === 401) {
  await refreshAccessToken();
  retryOriginalRequest();
}
```

### State Management

```javascript
const state = {
  accessToken: null,      // JWT access token
  refreshToken: null,     // Refresh token
  user: null,            // User object
  emails: [],            // Current email list
  filters: [],           // Active filters
  connectedAccounts: [], // Gmail accounts
  currentPage: 1,        // Pagination
  selectedInbox: null    // Current inbox filter
};
```

### Caching Strategy

1. **Backend Redis Cache**: 5-minute TTL for email lists
2. **Chrome Storage**: Persistent token storage
3. **Memory State**: In-memory email list for fast navigation

## 🎨 UI Components

### Color Scheme
- **Primary**: Purple gradient (#667eea → #764ba2)
- **Success**: Green (#10b981)
- **Error**: Red (#ef4444)
- **Background**: Light gray (#f9fafb)

### Typography
- **Font**: Inter, system fonts
- **Headings**: Bold, 16-24px
- **Body**: Regular, 12-14px
- **Labels**: Medium, 11-12px

### Animations
```css
.fade-in {
  animation: fadeIn 0.3s ease-in;
}

.email-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0,0,0,0.1);
}
```

## 🔧 Configuration

### API Endpoint
Update in `popup/popup.js`:
```javascript
const API_BASE_URL = 'http://localhost:8000/api/v1';
// For production: 'https://your-domain.com/api/v1'
```

### Sync Interval
Update in `background/service-worker.js`:
```javascript
chrome.alarms.create('emailSync', { 
  periodInMinutes: 5  // Change to desired interval
});
```

## 📊 Performance Optimizations

1. **Redis Caching**: Email lists cached for 5 minutes
2. **Pagination**: Load 20 emails at a time
3. **Lazy Loading**: Load more on demand
4. **Background Sync**: Non-blocking periodic updates
5. **Token Refresh**: Automatic, transparent to user

## 🐛 Debugging

### Check Console Logs

**Popup Console**:
```javascript
Right-click extension → Inspect popup → Console
```

**Background Console**:
```javascript
chrome://extensions → Service worker → Inspect
```

### Common Issues

**"Token expired" error**:
- Extension automatically refreshes tokens
- If persists, logout and login again

**No emails loading**:
- Check backend is running (`http://localhost:8000`)
- Verify Gmail account is connected
- Check browser console for errors

**Sync not working**:
- Check service worker is running
- Verify `autoSync` setting is enabled
- Check Chrome permissions

## 🚀 Production Deployment

### 1. Update API URL
```javascript
// popup.js
const API_BASE_URL = 'https://api.yourapp.com/api/v1';

// service-worker.js  
const API_BASE_URL = 'https://api.yourapp.com/api/v1';
```

### 2. Build Icons
Create proper icons:
- `icons/icon16.png` (16x16)
- `icons/icon48.png` (48x48)
- `icons/icon128.png` (128x128)

### 3. Update Manifest
```json
{
  "host_permissions": [
    "https://api.yourapp.com/*"
  ]
}
```

### 4. Package Extension
```powershell
# Zip the extension folder
Compress-Archive -Path extension/* -DestinationPath emailfilter-pro.zip
```

### 5. Publish to Chrome Web Store
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Upload `emailfilter-pro.zip`
3. Fill in store listing details
4. Submit for review

## 📝 API Endpoints Used

| Endpoint | Method | Purpose | Cache |
|----------|--------|---------|-------|
| `/auth/otp/request` | POST | Send OTP email | No |
| `/auth/otp/verify` | POST | Verify OTP & login | No |
| `/auth/refresh` | POST | Refresh access token | No |
| `/users/me` | GET | Get user info | No |
| `/google/auth-url` | GET | Get OAuth URL | No |
| `/google/connected-emails` | GET | List Gmail accounts | 5min |
| `/gmail-emails/all` | GET | All emails | 5min |
| `/gmail-emails/inbox/:id` | GET | Inbox emails | 5min |
| `/gmail-emails/inbox/:id/message/:mid` | GET | Email detail | 5min |
| `/filters` | GET | List filters | 5min |

## 🎯 Future Enhancements

- [ ] Filter creation UI in extension
- [ ] Email composition
- [ ] Attachment preview
- [ ] Advanced search with operators
- [ ] Keyboard shortcuts
- [ ] Dark mode
- [ ] Multiple languages
- [ ] Export emails
- [ ] Email templates
- [ ] Scheduled sending

## 📄 License

MIT License - Feel free to use and modify!

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

**Built with ❤️ using modern web technologies**

Tailwind CSS • Chrome Extension API • Fetch API • Chrome Storage API
