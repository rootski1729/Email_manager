# Cloudflare Turnstile Setup Guide

## What is Cloudflare Turnstile?

Cloudflare Turnstile is a user-friendly, privacy-preserving CAPTCHA alternative that protects your OTP API from abuse. It's:
- **Free** (unlimited requests)
- **Privacy-focused** (no cookies, no tracking)
- **User-friendly** (invisible challenge in most cases)
- **Faster** than traditional reCAPTCHA

## Backend Setup (Already Implemented ✅)

### 1. Configuration Added

In `.env` file, add:

```env
# Cloudflare Turnstile (CAPTCHA)
TURNSTILE_SECRET_KEY=your_secret_key_here
TURNSTILE_ENABLED=true  # Set to false to disable in development
```

### 2. Features Implemented

- ✅ Turnstile verification in `AuthService.verify_turnstile()`
- ✅ Protected `/auth/otp/request` endpoint
- ✅ Updated `OTPRequest` schema with `captcha_token` field
- ✅ Configurable via `TURNSTILE_ENABLED` flag
- ✅ Detailed error logging

## Frontend Setup

### Step 1: Get Cloudflare Turnstile Keys

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Turnstile** section
3. Click **Add Site**
4. Configure:
   - **Domain**: Your domain (e.g., `example.com`) or `localhost` for testing
   - **Widget Mode**: Choose **Managed** (recommended)
   - **Widget Type**: Choose **Invisible** for best UX
5. Copy your **Site Key** (public) and **Secret Key** (private)

### Step 2: Add Secret Key to Backend

Update your `.env` file:

```env
TURNSTILE_SECRET_KEY=0x4AAAAAAABCDEFGHIJKLMNOPQRSTUVWXYZ  # Your actual secret key
TURNSTILE_ENABLED=true
```

### Step 3: Frontend Implementation

#### React/Next.js Example

```tsx
import { useState } from 'react';

export default function LoginForm() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  // Load Turnstile script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!turnstileToken) {
      alert('Please complete the CAPTCHA');
      return;
    }

    try {
      const response = await fetch('/api/v1/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber,
          captcha_token: turnstileToken
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message);
      } else {
        const error = await response.json();
        alert(error.detail);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="tel"
        placeholder="+1234567890"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
      />

      {/* Cloudflare Turnstile Widget */}
      <div
        className="cf-turnstile"
        data-sitekey="YOUR_SITE_KEY_HERE"
        data-callback={(token) => setTurnstileToken(token)}
        data-theme="light"
      />

      <button type="submit">Send OTP</button>
    </form>
  );
}
```

#### Vanilla JavaScript Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Login</title>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
    <form id="loginForm">
        <input type="tel" id="phone" placeholder="+1234567890" required />
        
        <!-- Turnstile Widget -->
        <div class="cf-turnstile" 
             data-sitekey="YOUR_SITE_KEY_HERE"
             data-callback="onTurnstileSuccess"></div>
        
        <button type="submit">Send OTP</button>
    </form>

    <script>
        let turnstileToken = '';

        function onTurnstileSuccess(token) {
            turnstileToken = token;
            console.log('Turnstile verified');
        }

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!turnstileToken) {
                alert('Please complete the CAPTCHA');
                return;
            }

            const phone = document.getElementById('phone').value;

            try {
                const response = await fetch('/api/v1/auth/otp/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone_number: phone,
                        captcha_token: turnstileToken
                    })
                });

                const data = await response.json();
                
                if (response.ok) {
                    alert(data.message);
                } else {
                    alert(data.detail);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        });
    </script>
</body>
</html>
```

## API Changes

### Updated Request Schema

**Endpoint**: `POST /api/v1/auth/otp/request`

**Before**:
```json
{
  "phone_number": "+1234567890"
}
```

**After** (with Turnstile):
```json
{
  "phone_number": "+1234567890",
  "captcha_token": "0.AeJ1234567890abcdefghijklmnop..."
}
```

### Error Responses

| Status Code | Error | Reason |
|-------------|-------|--------|
| 400 | `CAPTCHA verification failed. Please try again.` | Invalid Turnstile token |
| 400 | `Invalid phone number format...` | Invalid phone format |
| 429 | `Too many OTP requests...` | Rate limit exceeded (3 OTPs per 15 min) |

## Testing

### Development Mode (Skip CAPTCHA)

For local testing without Turnstile, set in `.env`:

```env
TURNSTILE_ENABLED=false
```

Then you can send requests without `captcha_token`:

```bash
curl -X POST http://localhost:8000/api/v1/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+1234567890", "captcha_token": "dummy"}'
```

### Production Mode (With CAPTCHA)

1. Set `TURNSTILE_ENABLED=true` in `.env`
2. Add your `TURNSTILE_SECRET_KEY`
3. Frontend must include valid Turnstile token

## Turnstile Widget Configuration

### Widget Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Managed** | Cloudflare decides challenge difficulty | Recommended for most cases |
| **Non-interactive** | Always invisible, no challenge | Low-risk scenarios |
| **Invisible** | Hidden widget, shows challenge if suspicious | Best UX |

### Widget Themes

```html
<!-- Light Theme (default) -->
<div class="cf-turnstile" data-theme="light"></div>

<!-- Dark Theme -->
<div class="cf-turnstile" data-theme="dark"></div>

<!-- Auto (follows system preference) -->
<div class="cf-turnstile" data-theme="auto"></div>
```

### Widget Sizes

```html
<!-- Normal (default) - 300x65px -->
<div class="cf-turnstile" data-size="normal"></div>

<!-- Compact - 150x140px -->
<div class="cf-turnstile" data-size="compact"></div>
```

## Security Best Practices

1. **Never expose Secret Key** - Keep it in `.env` file, never commit to Git
2. **Use HTTPS** - Turnstile requires HTTPS in production
3. **Validate on backend** - Always verify token server-side (already implemented)
4. **Set domain restrictions** - Configure allowed domains in Cloudflare dashboard
5. **Monitor usage** - Check Cloudflare dashboard for abuse patterns

## Rate Limiting Protection

The API has multiple layers of protection:

1. **Turnstile CAPTCHA** - Blocks bots and automated abuse
2. **Redis Rate Limiting** - Max 3 OTP requests per 15 minutes per phone number
3. **OTP Expiry** - OTPs expire in 2 minutes
4. **One-time use** - OTPs are deleted after verification

## Troubleshooting

### Common Issues

**1. "CAPTCHA verification failed"**
- Check if `TURNSTILE_SECRET_KEY` is correct
- Verify domain is allowed in Cloudflare dashboard
- Check if token is expired (tokens expire after 5 minutes)

**2. "TURNSTILE_SECRET_KEY not configured"**
- Add `TURNSTILE_SECRET_KEY` to your `.env` file
- Restart the backend server

**3. Widget not showing on frontend**
- Ensure Turnstile script is loaded: `https://challenges.cloudflare.com/turnstile/v0/api.js`
- Check browser console for errors
- Verify site key is correct

**4. Token empty or undefined**
- Wait for Turnstile callback before submitting form
- Check if callback function is properly configured

## Migration Guide

If you have existing frontend code, update it:

### Step 1: Add Turnstile script

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

### Step 2: Add widget to form

```html
<div class="cf-turnstile" 
     data-sitekey="YOUR_SITE_KEY"
     data-callback="onTurnstileSuccess"></div>
```

### Step 3: Update API call

```javascript
// Before
fetch('/api/v1/auth/otp/request', {
  method: 'POST',
  body: JSON.stringify({ phone_number: '+1234567890' })
});

// After
fetch('/api/v1/auth/otp/request', {
  method: 'POST',
  body: JSON.stringify({
    phone_number: '+1234567890',
    captcha_token: turnstileToken  // Add this
  })
});
```

## Cost

**Cloudflare Turnstile is FREE** 🎉
- Unlimited verifications
- No credit card required
- No hidden fees

Compare to Google reCAPTCHA v3:
- reCAPTCHA: Free for first 1M requests/month, then $1 per 1K
- Turnstile: Always free

## Support

- **Cloudflare Docs**: https://developers.cloudflare.com/turnstile/
- **Dashboard**: https://dash.cloudflare.com/
- **API Reference**: https://developers.cloudflare.com/turnstile/get-started/

## Next Steps

1. ✅ Backend implementation complete
2. ⏳ Get Turnstile keys from Cloudflare dashboard
3. ⏳ Add `TURNSTILE_SECRET_KEY` to `.env`
4. ⏳ Implement frontend widget
5. ⏳ Test in development
6. ⏳ Deploy to production
