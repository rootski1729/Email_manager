// API Configuration
const API_BASE_URL = 'http://localhost:8000/api/v1';

// State Management
const state = {
  accessToken: null,
  refreshToken: null,
  user: null,
  emails: [],
  filters: [],
  connectedAccounts: [],
  currentPage: 1,
  selectedInbox: null
};

// DOM Elements
const elements = {
  // Screens
  loginScreen: document.getElementById('loginScreen'),
  dashboardScreen: document.getElementById('dashboardScreen'),
  
  // Login
  emailInput: document.getElementById('emailInput'),
  sendOtpBtn: document.getElementById('sendOtpBtn'),
  otpSection: document.getElementById('otpSection'),
  otpInput: document.getElementById('otpInput'),
  verifyOtpBtn: document.getElementById('verifyOtpBtn'),
  loadingIndicator: document.getElementById('loadingIndicator'),
  
  // Dashboard
  userEmail: document.getElementById('userEmail'),
  inboxCount: document.getElementById('inboxCount'),
  emailCount: document.getElementById('emailCount'),
  filterCount: document.getElementById('filterCount'),
  logoutBtn: document.getElementById('logoutBtn'),
  logoutBtnSettings: document.getElementById('logoutBtnSettings'),
  
  // Emails Tab
  inboxSelector: document.getElementById('inboxSelector'),
  emailSearch: document.getElementById('emailSearch'),
  emailList: document.getElementById('emailList'),
  loadMoreBtn: document.getElementById('loadMoreBtn'),
  
  // Filters Tab
  createFilterBtn: document.getElementById('createFilterBtn'),
  filterList: document.getElementById('filterList'),
  
  // Settings Tab
  connectedAccounts: document.getElementById('connectedAccounts'),
  connectGmailBtn: document.getElementById('connectGmailBtn'),
  autoSyncToggle: document.getElementById('autoSyncToggle'),
  userPlan: document.getElementById('userPlan'),
  memberSince: document.getElementById('memberSince'),
  
  // Tabs
  tabBtns: document.querySelectorAll('.tab-btn'),
  emailsTab: document.getElementById('emailsTab'),
  filtersTab: document.getElementById('filtersTab'),
  settingsTab: document.getElementById('settingsTab'),
  
  // Email Detail Modal
  emailDetailModal: document.getElementById('emailDetailModal'),
  emailDetailContent: document.getElementById('emailDetailContent'),
  closeEmailDetail: document.getElementById('closeEmailDetail')
};

// ============================================
// API Client with Token Management
// ============================================

class APIClient {
  constructor() {
    this.baseURL = API_BASE_URL;
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    // Add auth token if available
    if (state.accessToken && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${state.accessToken}`;
    }
    
    try {
      let response = await fetch(url, {
        ...options,
        headers
      });
      
      // Handle token expiration - auto refresh
      if (response.status === 401 && state.refreshToken && !options.skipRefresh) {
        console.log('🔄 Access token expired, refreshing...');
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry original request with new token
          headers['Authorization'] = `Bearer ${state.accessToken}`;
          response = await fetch(url, { ...options, headers });
        } else {
          await this.logout();
          throw new Error('Session expired. Please login again.');
        }
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('❌ API Error:', error);
      throw error;
    }
  }
  
  async refreshAccessToken() {
    try {
      const response = await this.request('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: state.refreshToken }),
        skipAuth: true,
        skipRefresh: true
      });
      
      state.accessToken = response.access_token;
      state.refreshToken = response.refresh_token;
      await this.saveTokens();
      console.log('✅ Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to refresh token:', error);
      return false;
    }
  }
  
  async saveTokens() {
    await chrome.storage.local.set({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken
    });
  }
  
  async loadTokens() {
    const data = await chrome.storage.local.get(['accessToken', 'refreshToken']);
    state.accessToken = data.accessToken || null;
    state.refreshToken = data.refreshToken || null;
    return !!state.accessToken;
  }
  
  async logout() {
    state.accessToken = null;
    state.refreshToken = null;
    state.user = null;
    await chrome.storage.local.clear();
    showScreen('login');
  }
  
  // Auth endpoints
  async sendOTP(email) {
    return await this.request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true
    });
  }
  
  async verifyOTP(email, code) {
    return await this.request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
      skipAuth: true
    });
  }
  
  // User endpoints
  async getCurrentUser() {
    return await this.request('/users/me');
  }
  
  // Gmail endpoints
  async getConnectedEmails() {
    return await this.request('/google/connected-emails');
  }
  
  async getGmailAuthUrl() {
    const user = await this.getCurrentUser();
    return await this.request(`/google/auth-url?user_id=${user.id}`);
  }
  
  // Email fetching endpoints
  async getAllEmails(page = 1, pageSize = 20) {
    return await this.request(`/gmail-emails/all?page=${page}&page_size=${pageSize}`);
  }
  
  async getEmailsByInbox(connectedEmailId, page = 1, pageSize = 20) {
    return await this.request(`/gmail-emails/inbox/${connectedEmailId}?page=${page}&page_size=${pageSize}`);
  }
  
  async getEmailDetail(connectedEmailId, messageId) {
    return await this.request(`/gmail-emails/inbox/${connectedEmailId}/message/${messageId}`);
  }
  
  // Filter endpoints
  async getFilters() {
    return await this.request('/filters');
  }
  
  async createFilter(filterData) {
    return await this.request('/filters', {
      method: 'POST',
      body: JSON.stringify(filterData)
    });
  }
}

const api = new APIClient();

// ============================================
// UI Helpers
// ============================================

function showLoading(show = true) {
  if (show) {
    elements.loadingIndicator.classList.remove('hidden');
  } else {
    elements.loadingIndicator.classList.add('hidden');
  }
}

function showScreen(screen) {
  elements.loginScreen.classList.add('hidden');
  elements.dashboardScreen.classList.add('hidden');
  
  if (screen === 'login') {
    elements.loginScreen.classList.remove('hidden');
  } else if (screen === 'dashboard') {
    elements.dashboardScreen.classList.remove('hidden');
  }
}

function showNotification(message, type = 'success') {
  // Simple notification (you can enhance this with a toast library)
  const color = type === 'success' ? 'green' : 'red';
  const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
  
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 bg-${color}-100 border border-${color}-300 text-${color}-800 px-4 py-3 rounded-lg shadow-lg fade-in`;
  notification.innerHTML = `
    <i class="fas fa-${icon} mr-2"></i>${message}
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  
  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }
  
  return date.toLocaleDateString();
}

// ============================================
// Login Flow
// ============================================

elements.sendOtpBtn.addEventListener('click', async () => {
  const email = elements.emailInput.value.trim();
  
  if (!email || !email.includes('@')) {
    showNotification('Please enter a valid email', 'error');
    return;
  }
  
  showLoading(true);
  
  try {
    await api.sendOTP(email);
    elements.otpSection.classList.remove('hidden');
    elements.sendOtpBtn.disabled = true;
    elements.emailInput.disabled = true;
    showNotification('OTP sent! Check your email');
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    showLoading(false);
  }
});

elements.verifyOtpBtn.addEventListener('click', async () => {
  const email = elements.emailInput.value.trim();
  const code = elements.otpInput.value.trim();
  
  if (code.length !== 6) {
    showNotification('Please enter 6-digit OTP', 'error');
    return;
  }
  
  showLoading(true);
  
  try {
    const response = await api.verifyOTP(email, code);
    state.accessToken = response.access_token;
    state.refreshToken = response.refresh_token;
    await api.saveTokens();
    
    showNotification('Login successful!');
    await initializeDashboard();
  } catch (error) {
    showNotification(error.message, 'error');
  } finally {
    showLoading(false);
  }
});

// ============================================
// Dashboard
// ============================================

async function initializeDashboard() {
  showScreen('dashboard');
  showLoading(true);
  
  try {
    // Load user data
    state.user = await api.getCurrentUser();
    elements.userEmail.textContent = state.user.email;
    elements.userPlan.textContent = state.user.plan_name || 'Free';
    elements.memberSince.textContent = formatDate(state.user.created_at);
    
    // Load connected accounts
    state.connectedAccounts = await api.getConnectedEmails();
    elements.inboxCount.textContent = state.connectedAccounts.length;
    
    // Update inbox selector
    updateInboxSelector();
    
    // Load emails and filters
    await loadEmails();
    await loadFilters();
    
    // Update stats
    elements.filterCount.textContent = state.user.filters_count || 0;
    
  } catch (error) {
    showNotification('Failed to load dashboard: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function updateInboxSelector() {
  const selector = elements.inboxSelector;
  selector.innerHTML = '<option value="">All Inboxes</option>';
  
  state.connectedAccounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.email_address;
    selector.appendChild(option);
  });
  
  // Update connected accounts in settings
  elements.connectedAccounts.innerHTML = state.connectedAccounts.map(account => `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div class="flex items-center space-x-3">
        <i class="fab fa-google text-xl text-blue-500"></i>
        <div>
          <p class="font-medium text-sm">${account.email_address}</p>
          <p class="text-xs text-gray-500">
            ${account.is_active ? '<span class="text-green-600">Active</span>' : '<span class="text-gray-400">Inactive</span>'}
          </p>
        </div>
      </div>
    </div>
  `).join('');
}

async function loadEmails(page = 1) {
  showLoading(true);
  
  try {
    let response;
    if (state.selectedInbox) {
      response = await api.getEmailsByInbox(state.selectedInbox, page, 20);
    } else {
      response = await api.getAllEmails(page, 20);
    }
    
    if (page === 1) {
      state.emails = response.emails;
    } else {
      state.emails.push(...response.emails);
    }
    
    state.currentPage = page;
    elements.emailCount.textContent = response.total;
    
    renderEmails();
    
    // Show/hide load more button
    if (state.emails.length < response.total) {
      elements.loadMoreBtn.classList.remove('hidden');
    } else {
      elements.loadMoreBtn.classList.add('hidden');
    }
    
  } catch (error) {
    showNotification('Failed to load emails: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function renderEmails() {
  if (state.emails.length === 0) {
    elements.emailList.innerHTML = `
      <div class="text-center py-8 text-gray-500">
        <i class="fas fa-inbox text-4xl mb-3"></i>
        <p>No emails found</p>
      </div>
    `;
    return;
  }
  
  elements.emailList.innerHTML = state.emails.map(email => `
    <div class="email-card bg-white border border-gray-200 rounded-lg p-3 cursor-pointer" data-email-id="${email.id}" data-connected-id="${email.connected_email_id}">
      <div class="flex items-start justify-between mb-2">
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm text-gray-800 truncate">${email.subject}</p>
          <p class="text-xs text-gray-600 truncate">${email.sender}</p>
        </div>
        <span class="text-xs text-gray-500 ml-2">${formatDate(email.received_at)}</span>
      </div>
      <p class="text-xs text-gray-600 line-clamp-2">${email.snippet || 'No preview available'}</p>
      ${email.labels && email.labels.length > 0 ? `
        <div class="mt-2 flex flex-wrap gap-1">
          ${email.labels.slice(0, 3).map(label => `
            <span class="badge bg-purple-100 text-purple-700">${label}</span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.email-card').forEach(card => {
    card.addEventListener('click', () => {
      const connectedId = card.dataset.connectedId;
      const messageId = card.dataset.emailId;
      showEmailDetail(connectedId, messageId);
    });
  });
}

async function showEmailDetail(connectedEmailId, messageId) {
  showLoading(true);
  
  try {
    const email = await api.getEmailDetail(connectedEmailId, messageId);
    
    elements.emailDetailContent.innerHTML = `
      <div class="space-y-3">
        <div>
          <h3 class="font-bold text-lg text-gray-800 mb-2">${email.subject}</h3>
          <div class="text-sm text-gray-600 space-y-1">
            <p><strong>From:</strong> ${email.from}</p>
            <p><strong>To:</strong> ${email.to}</p>
            <p><strong>Date:</strong> ${new Date(email.date).toLocaleString()}</p>
          </div>
        </div>
        
        ${email.labels && email.labels.length > 0 ? `
          <div class="flex flex-wrap gap-1">
            ${email.labels.map(label => `
              <span class="badge bg-purple-100 text-purple-700">${label}</span>
            `).join('')}
          </div>
        ` : ''}
        
        <div class="pt-3 border-t">
          <p class="text-sm text-gray-700 whitespace-pre-wrap">${email.body_text || email.snippet || 'No content'}</p>
        </div>
      </div>
    `;
    
    elements.emailDetailModal.classList.remove('hidden');
  } catch (error) {
    showNotification('Failed to load email: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadFilters() {
  try {
    state.filters = await api.getFilters();
    renderFilters();
  } catch (error) {
    console.error('Failed to load filters:', error);
  }
}

function renderFilters() {
  if (state.filters.length === 0) {
    elements.filterList.innerHTML = `
      <div class="text-center py-8 text-gray-500">
        <i class="fas fa-filter text-4xl mb-3"></i>
        <p>No filters created yet</p>
      </div>
    `;
    return;
  }
  
  elements.filterList.innerHTML = state.filters.map(filter => `
    <div class="bg-white border border-gray-200 rounded-lg p-3">
      <div class="flex items-start justify-between mb-2">
        <h3 class="font-semibold text-sm text-gray-800">${filter.name}</h3>
        <span class="badge ${filter.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
          ${filter.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p class="text-xs text-gray-600 mb-2">${filter.filter_type}</p>
      ${filter.conditions ? `
        <div class="text-xs text-gray-500">
          ${Object.entries(filter.conditions).slice(0, 2).map(([key, val]) => `
            <p><strong>${key}:</strong> ${val}</p>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

// ============================================
// Event Listeners
// ============================================

// Tab switching
elements.tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    // Update active tab button
    elements.tabBtns.forEach(b => {
      b.classList.remove('active', 'text-purple-600', 'border-b-2', 'border-purple-600');
      b.classList.add('text-gray-600');
    });
    btn.classList.add('active', 'text-purple-600', 'border-b-2', 'border-purple-600');
    btn.classList.remove('text-gray-600');
    
    // Show corresponding tab content
    elements.emailsTab.classList.add('hidden');
    elements.filtersTab.classList.add('hidden');
    elements.settingsTab.classList.add('hidden');
    
    if (tab === 'emails') elements.emailsTab.classList.remove('hidden');
    if (tab === 'filters') elements.filtersTab.classList.remove('hidden');
    if (tab === 'settings') elements.settingsTab.classList.remove('hidden');
  });
});

// Inbox selector
elements.inboxSelector.addEventListener('change', (e) => {
  state.selectedInbox = e.target.value || null;
  loadEmails(1);
});

// Load more emails
elements.loadMoreBtn.addEventListener('click', () => {
  loadEmails(state.currentPage + 1);
});

// Connect Gmail
elements.connectGmailBtn.addEventListener('click', async () => {
  try {
    const response = await api.getGmailAuthUrl();
    window.open(response.auth_url, '_blank');
    showNotification('Opening Google authorization...');
  } catch (error) {
    showNotification('Failed to connect Gmail: ' + error.message, 'error');
  }
});

// Logout
[elements.logoutBtn, elements.logoutBtnSettings].forEach(btn => {
  btn.addEventListener('click', () => {
    api.logout();
  });
});

// Close email detail modal
elements.closeEmailDetail.addEventListener('click', () => {
  elements.emailDetailModal.classList.add('hidden');
});

// ============================================
// Initialization
// ============================================

async function init() {
  const hasTokens = await api.loadTokens();
  
  if (hasTokens) {
    try {
      await initializeDashboard();
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      showScreen('login');
    }
  } else {
    showScreen('login');
  }
}

// Start the app
init();
