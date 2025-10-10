// Background Service Worker for EmailFilter Pro
// Handles periodic sync, notifications, and token refresh

const API_BASE_URL = 'http://localhost:8000/api/v1';

// Alarm for periodic email sync
chrome.alarms.create('emailSync', { periodInMinutes: 5 });

// Listen for alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'emailSync') {
    await syncEmails();
  }
});

// Sync emails and check for new filtered emails
async function syncEmails() {
  try {
    const { accessToken, refreshToken } = await chrome.storage.local.get(['accessToken', 'refreshToken']);
    
    if (!accessToken) {
      console.log('⏭️ Skipping sync - not logged in');
      return;
    }
    
    console.log('🔄 Starting email sync...');
    
    // Fetch new emails (this will be cached by backend)
    const response = await fetch(`${API_BASE_URL}/gmail-emails/all?page=1&page_size=10`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Synced ${data.emails.length} emails`);
      
      // Check for new filtered emails
      const lastSyncTime = await getLastSyncTime();
      const newFilteredEmails = data.emails.filter(email => 
        email.matched_filters && 
        email.matched_filters.length > 0 &&
        new Date(email.received_at) > new Date(lastSyncTime)
      );
      
      if (newFilteredEmails.length > 0) {
        await notifyFilteredEmails(newFilteredEmails);
      }
      
      await setLastSyncTime();
    } else if (response.status === 401) {
      console.log('🔑 Token expired, attempting refresh...');
      await refreshAccessToken(refreshToken);
    }
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

// Refresh access token
async function refreshAccessToken(refreshToken) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    if (response.ok) {
      const data = await response.json();
      await chrome.storage.local.set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token
      });
      console.log('✅ Token refreshed successfully');
      return true;
    }
  } catch (error) {
    console.error('❌ Token refresh failed:', error);
  }
  return false;
}

// Show notification for filtered emails
async function notifyFilteredEmails(emails) {
  for (const email of emails) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'Email Filtered!',
      message: `${email.subject}\nFrom: ${email.sender}\nFilter: ${email.matched_filters[0].name}`,
      priority: 2
    });
  }
}

// Get last sync time
async function getLastSyncTime() {
  const { lastSyncTime } = await chrome.storage.local.get('lastSyncTime');
  return lastSyncTime || new Date(0).toISOString();
}

// Set last sync time
async function setLastSyncTime() {
  await chrome.storage.local.set({ lastSyncTime: new Date().toISOString() });
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('📧 EmailFilter Pro installed!');
  
  // Set default settings
  chrome.storage.local.set({
    autoSync: true,
    notificationsEnabled: true
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'forceSync') {
    syncEmails().then(() => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'getStats') {
    chrome.storage.local.get(['lastSyncTime'], (data) => {
      sendResponse({ lastSyncTime: data.lastSyncTime });
    });
    return true;
  }
});

console.log('🚀 EmailFilter Pro background service started');
