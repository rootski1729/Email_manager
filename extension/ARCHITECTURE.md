# 🎨 EmailFilter Pro - Visual Architecture Guide

## 📐 Extension Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                          │
│                   EmailFilter Pro v1.0                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ┌────────┐        ┌──────────┐      ┌─────────────┐
   │ Popup  │        │Background│      │Chrome APIs  │
   │  (UI)  │        │  Worker  │      │             │
   └────────┘        └──────────┘      └─────────────┘
        │                  │                  │
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  FastAPI     │
                    │  Backend     │
                    └──────────────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ▼          ▼          ▼
          ┌─────────┐ ┌────────┐ ┌──────┐
          │PostgreSQL│ │ Redis  │ │Gmail │
          │    DB    │ │ Cache  │ │ API  │
          └─────────┘ └────────┘ └──────┘
```

---

## 🎨 UI Flow Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    EXTENSION ICON                         │
│                    (Click to open)                        │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   CHECK AUTH STATUS    │
              └────────────────────────┘
                    │            │
           No Token │            │ Has Token
                    ▼            ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  LOGIN SCREEN    │  │   DASHBOARD      │
        │                  │  │   (Auto-login)   │
        │  1. Enter email  │  └──────────────────┘
        │  2. Send OTP     │            │
        │  3. Verify OTP   │            │
        └──────────────────┘            │
                    │                   │
                    └───────┬───────────┘
                            ▼
                ┌──────────────────────┐
                │     DASHBOARD        │
                │  ┌────────────────┐  │
                │  │  Header Stats  │  │
                │  ├────────────────┤  │
                │  │  Tab Navigation│  │
                │  ├────────────────┤  │
                │  │                │  │
                │  │  📧 Emails Tab │◄─┼──┐
                │  │  🎯 Filters    │  │  │
                │  │  ⚙️  Settings  │  │  │
                │  │                │  │  │
                │  └────────────────┘  │  │
                └──────────────────────┘  │
                                          │
        ┌─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│           EMAILS TAB (Default)              │
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐  │
│  │ Inbox Selector: [All Inboxes ▼]      │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ 🔍 Search emails...                   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ ✉️  Email Subject           2h ago   │◄─┼─ Click
│  │ sender@example.com                    │  │   │
│  │ Preview text goes here...             │  │   │
│  │ [Work] [Important]                    │  │   │
│  └───────────────────────────────────────┘  │   │
│                                             │   │
│  ┌───────────────────────────────────────┐  │   │
│  │ ✉️  Another Email          5h ago    │  │   │
│  │ ...                                   │  │   │
│  └───────────────────────────────────────┘  │   │
│                                             │   │
│  [ Load More ]                              │   │
└─────────────────────────────────────────────┘   │
                                                  │
                    ┌─────────────────────────────┘
                    │
                    ▼
        ┌────────────────────────────┐
        │   EMAIL DETAIL MODAL       │
        ├────────────────────────────┤
        │ Subject: Important Email   │
        │ From: sender@example.com   │
        │ To: you@example.com       │
        │ Date: Oct 10, 2025 4:06PM │
        │                            │
        │ [Work] [Important]         │
        │                            │
        │ ────────────────────────   │
        │                            │
        │ Email body content here... │
        │                            │
        │                      [ X ] │
        └────────────────────────────┘
```

---

## 🔄 Authentication Flow

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│  Enter   │──────▶│ Send OTP │──────▶│ Receive  │
│  Email   │       │ Request  │       │   OTP    │
└──────────┘       └──────────┘       └──────────┘
                                            │
                                            ▼
                                      ┌──────────┐
                                      │ Verify   │
                                      │   OTP    │
                                      └──────────┘
                                            │
                                            ▼
                                      ┌──────────┐
                                      │  Tokens  │
                                      │ Received │
                                      └──────────┘
                                            │
                                            ▼
                    ┌─────────────────────────────────────┐
                    │  SAVE TO CHROME STORAGE             │
                    │  ✓ accessToken                      │
                    │  ✓ refreshToken                     │
                    └─────────────────────────────────────┘
                                            │
                                            ▼
                                      ┌──────────┐
                                      │Dashboard │
                                      └──────────┘
```

---

## 🔑 Token Refresh Flow

```
┌────────────────┐
│ API Request    │
│ with Token     │
└────────────────┘
        │
        ▼
┌────────────────┐
│  Backend       │
│  Validates     │
│  Token         │
└────────────────┘
        │
        ├─────────────────┬─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────┐      ┌──────────┐      ┌──────────┐
│Token OK  │      │401 Error │      │Other     │
│Return    │      │Token     │      │Error     │
│Data      │      │Expired   │      │Show Msg  │
└──────────┘      └──────────┘      └──────────┘
                        │
                        ▼
              ┌──────────────────┐
              │ Auto Refresh     │
              │ Token            │
              │                  │
              │ POST /auth/      │
              │      refresh     │
              └──────────────────┘
                        │
                ┌───────┴───────┐
                │               │
                ▼               ▼
        ┌──────────┐    ┌──────────┐
        │ Success  │    │  Failed  │
        │ Save New │    │  Logout  │
        │ Tokens   │    │  User    │
        └──────────┘    └──────────┘
                │
                ▼
        ┌──────────────┐
        │ Retry        │
        │ Original     │
        │ Request      │
        └──────────────┘
                │
                ▼
        ┌──────────────┐
        │ Return Data  │
        │ to User      │
        └──────────────┘
```

---

## 📊 Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                   USER INTERACTION                       │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    POPUP UI (popup.js)                   │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │         APIClient.request(endpoint)            │    │
│  │                                                 │    │
│  │  1. Add Authorization header                   │    │
│  │  2. Make fetch() call                          │    │
│  │  3. Handle 401 → refresh token                 │    │
│  │  4. Retry request                              │    │
│  │  5. Return data                                │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              FASTAPI BACKEND (main.py)                   │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  1. Validate JWT token                         │    │
│  │  2. Check Redis cache                          │    │
│  │  3. If cached → return                         │    │
│  │  4. Else → fetch from Gmail API                │    │
│  │  5. Cache result (5 min TTL)                   │    │
│  │  6. Return response                            │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                            │
                ┌───────────┼───────────┐
                │           │           │
                ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │PostgreSQL│ │  Redis   │ │  Gmail   │
        │          │ │  Cache   │ │   API    │
        │ • Users  │ │          │ │          │
        │ • Emails │ │ • Emails │ │ GET      │
        │ • Filters│ │ • User   │ │ messages │
        │          │ │   data   │ │          │
        └──────────┘ └──────────┘ └──────────┘
```

---

## 🎯 Email Fetching Flow

```
1. User clicks "Emails" tab
        │
        ▼
2. popup.js → loadEmails()
        │
        ▼
3. Check selectedInbox
        │
        ├─── If null → api.getAllEmails()
        │
        └─── If set → api.getEmailsByInbox(id)
                │
                ▼
4. APIClient adds auth header
                │
                ▼
5. GET /api/v1/gmail-emails/all?page=1&page_size=20
                │
                ▼
6. Backend checks Redis cache
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
    CACHE HIT      CACHE MISS
    Return          Fetch from
    cached          Gmail API
    data               │
        │              ▼
        │          Cache result
        │          (5 min TTL)
        │              │
        └──────┬───────┘
               ▼
7. Return JSON response
        {
          emails: [...],
          total: 150,
          page: 1,
          page_size: 20
        }
               │
               ▼
8. popup.js → renderEmails()
               │
               ▼
9. Update DOM with email cards
               │
               ▼
10. User sees emails ✅
```

---

## 🔄 Background Sync Flow

```
┌────────────────────────────────────────────┐
│  Chrome Alarms API                         │
│  Trigger every 5 minutes                   │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│  service-worker.js                         │
│  syncEmails() function                     │
└────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Check if logged in    │
        │ (has accessToken)     │
        └───────────────────────┘
                │           │
           No   │           │ Yes
                ▼           ▼
        ┌─────────┐  ┌────────────────┐
        │  Skip   │  │ Fetch emails   │
        └─────────┘  │ (last 10)      │
                     └────────────────┘
                             │
                             ▼
                     ┌────────────────┐
                     │ Get lastSync   │
                     │ timestamp      │
                     └────────────────┘
                             │
                             ▼
                     ┌────────────────┐
                     │ Filter new     │
                     │ emails that    │
                     │ match filters  │
                     └────────────────┘
                             │
                     ┌───────┴────────┐
                     │                │
                 No new          Has new
                 emails          emails
                     │                │
                     ▼                ▼
              ┌──────────┐   ┌────────────────┐
              │ Update   │   │ Show           │
              │lastSync  │   │notifications   │
              └──────────┘   └────────────────┘
                                      │
                                      ▼
                              ┌────────────────┐
                              │ 📧 Email       │
                              │ Filtered!      │
                              │                │
                              │ Subject: ...   │
                              │ Filter: Work   │
                              └────────────────┘
```

---

## 🎨 Component Hierarchy

```
Extension Root
│
├── manifest.json (Configuration)
│
├── popup/
│   │
│   ├── popup.html (UI Template)
│   │   │
│   │   ├── Login Screen
│   │   │   ├── Email input
│   │   │   ├── OTP section
│   │   │   └── Loading indicator
│   │   │
│   │   └── Dashboard Screen
│   │       ├── Header
│   │       │   ├── User info
│   │       │   ├── Stats (3 cards)
│   │       │   └── Logout button
│   │       │
│   │       ├── Tab Navigation
│   │       │   ├── Emails tab button
│   │       │   ├── Filters tab button
│   │       │   └── Settings tab button
│   │       │
│   │       ├── Emails Tab Content
│   │       │   ├── Inbox selector
│   │       │   ├── Search input
│   │       │   ├── Email list
│   │       │   │   └── Email cards (dynamic)
│   │       │   └── Load more button
│   │       │
│   │       ├── Filters Tab Content
│   │       │   ├── Create filter button
│   │       │   └── Filter list
│   │       │       └── Filter cards (dynamic)
│   │       │
│   │       └── Settings Tab Content
│   │           ├── Connected accounts
│   │           ├── Connect Gmail button
│   │           ├── Auto-sync toggle
│   │           ├── Account info
│   │           └── Logout button
│   │
│   └── popup.js (Logic)
│       │
│       ├── APIClient class
│       │   ├── request()
│       │   ├── refreshAccessToken()
│       │   ├── saveTokens()
│       │   └── logout()
│       │
│       ├── Event Handlers
│       │   ├── Login flow
│       │   ├── Tab switching
│       │   ├── Email interactions
│       │   └── Settings actions
│       │
│       └── Rendering Functions
│           ├── renderEmails()
│           ├── renderFilters()
│           └── updateInboxSelector()
│
├── background/
│   └── service-worker.js
│       │
│       ├── Alarm listener (5-min sync)
│       ├── syncEmails()
│       ├── refreshAccessToken()
│       └── notifyFilteredEmails()
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 📱 Screen States

### Login Screen States

```
1. Initial State
   ┌────────────────┐
   │ Email input    │
   │ [Send OTP]     │
   └────────────────┘

2. OTP Sent
   ┌────────────────┐
   │ Email (locked) │
   │ ✅ OTP sent!   │
   │ OTP input      │
   │ [Verify]       │
   └────────────────┘

3. Loading
   ┌────────────────┐
   │   Processing   │
   │   ⏳ Loading   │
   └────────────────┘

4. Success
   → Redirect to Dashboard
```

### Dashboard States

```
1. Loading State
   ┌────────────────┐
   │ ⏳ Loading...  │
   │                │
   └────────────────┘

2. Empty State (No emails)
   ┌────────────────┐
   │ 📭 No emails   │
   │    found       │
   └────────────────┘

3. Loaded State
   ┌────────────────┐
   │ ✉️ Email 1     │
   │ ✉️ Email 2     │
   │ ✉️ Email 3     │
   │ [Load More]    │
   └────────────────┘

4. Email Detail
   ┌────────────────┐
   │ Modal overlay  │
   │ Email content  │
   │     [X]        │
   └────────────────┘
```

---

## 🔌 API Endpoints Map

```
Authentication
├── POST /auth/otp/request        → Send OTP
├── POST /auth/otp/verify         → Verify OTP → Tokens
└── POST /auth/refresh            → Refresh token

User
└── GET /users/me                 → User info + stats

Gmail OAuth
├── GET /google/auth-url          → OAuth URL
├── GET /google/callback          → OAuth callback
└── GET /google/connected-emails  → List accounts

Email Fetching
├── GET /gmail-emails/all         → All emails (all inboxes)
├── GET /gmail-emails/inbox/:id   → Emails from one inbox
└── GET /gmail-emails/inbox/:id/message/:mid → Email detail

Filters
├── GET /filters                  → List filters
├── POST /filters                 → Create filter
├── PUT /filters/:id              → Update filter
└── DELETE /filters/:id           → Delete filter
```

---

## 🎨 Color Palette

```
Primary Colors
├── Purple Start:  #667eea  ████████
├── Purple End:    #764ba2  ████████
└── Gradient:      linear-gradient(135deg, #667eea, #764ba2)

Semantic Colors
├── Success:       #10b981  ████████ (Green)
├── Error:         #ef4444  ████████ (Red)
├── Warning:       #f59e0b  ████████ (Orange)
└── Info:          #3b82f6  ████████ (Blue)

Neutral Colors
├── Gray 50:       #f9fafb  ████████
├── Gray 100:      #f3f4f6  ████████
├── Gray 300:      #d1d5db  ████████
├── Gray 600:      #4b5563  ████████
└── Gray 800:      #1f2937  ████████

Text Colors
├── Primary:       #1f2937  ████████
├── Secondary:     #4b5563  ████████
└── Muted:         #9ca3af  ████████
```

---

**This visual guide helps you understand the complete architecture at a glance!** 🎨

