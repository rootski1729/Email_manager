"""
Pydantic schemas for request/response validation
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr, Field, validator
from app.models import PlanType, FilterType, ActionType, EmailDigestFrequency


# ===== Auth Schemas =====
class OTPRequest(BaseModel):
    """Request OTP for login/signup"""
    email: EmailStr


class OTPVerify(BaseModel):
    """Verify OTP and get tokens"""
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


class TokenResponse(BaseModel):
    """JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Refresh token request"""
    refresh_token: str


# ===== User Schemas =====
class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    phone_number: Optional[str] = Field(None, description="Phone number in E.164 format (e.g., +1234567890)")


class UserCreate(UserBase):
    """Create user"""
    pass


class UserUpdate(BaseModel):
    """Update user"""
    phone_number: Optional[str] = Field(None, description="Phone number in E.164 format (e.g., +1234567890)")


class UserResponse(UserBase):
    """User response"""
    id: int
    phone_verified: bool = False
    is_active: bool
    is_verified: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserWithPlan(UserResponse):
    """User with plan details"""
    plan_name: Optional[str] = None
    plan_max_emails: Optional[int] = None
    plan_max_filters: Optional[int] = None
    connected_emails_count: int = 0
    filters_count: int = 0


# ===== Plan Schemas =====
class PlanBase(BaseModel):
    """Base plan schema"""
    name: PlanType
    max_emails: int
    max_filters: int
    price_monthly: int
    features: Dict[str, Any] = {}


class PlanResponse(PlanBase):
    """Plan response"""
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserPlanResponse(BaseModel):
    """User plan response"""
    id: int
    user_id: int
    plan: PlanResponse
    started_at: datetime
    expires_at: Optional[datetime]
    is_active: bool
    auto_renew: bool
    
    class Config:
        from_attributes = True


# ===== Connected Email Schemas =====
class ConnectedEmailBase(BaseModel):
    """Base connected email schema"""
    email_address: EmailStr


class ConnectedEmailCreate(BaseModel):
    """Create connected email (from Google OAuth)"""
    email_address: EmailStr
    access_token: str
    refresh_token: str
    expires_in: int  # seconds


class ConnectedEmailResponse(ConnectedEmailBase):
    """Connected email response"""
    id: int
    user_id: int
    is_active: bool
    last_synced_at: Optional[datetime]
    created_at: datetime
    token_expires_at: datetime
    
    class Config:
        from_attributes = True


# ===== Email Filter Schemas =====
class FilterConditions(BaseModel):
    """Filter conditions"""
    sender: Optional[str] = None
    subject_contains: Optional[str] = None
    body_contains: Optional[str] = None
    sender_domain: Optional[str] = None
    
    @validator('*', pre=True)
    def strip_strings(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v


class EmailFilterCreate(BaseModel):
    """Create email filter"""
    name: str = Field(..., min_length=1, max_length=255)
    filter_type: FilterType
    conditions: FilterConditions
    action_type: ActionType = ActionType.NOTIFY
    priority: int = Field(default=0, ge=0, le=100)


class EmailFilterUpdate(BaseModel):
    """Update email filter"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    conditions: Optional[FilterConditions] = None
    action_type: Optional[ActionType] = None
    priority: Optional[int] = Field(None, ge=0, le=100)
    is_active: Optional[bool] = None


class EmailFilterResponse(BaseModel):
    """Email filter response"""
    id: int
    user_id: int
    name: str
    filter_type: FilterType
    conditions: Dict[str, Any]
    action_type: ActionType
    priority: int
    is_active: bool
    match_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ===== Filtered Email Schemas =====
class FilteredEmailResponse(BaseModel):
    """Filtered email response"""
    id: int
    user_id: int
    connected_email_id: int
    gmail_message_id: str
    sender: str
    subject: str
    snippet: Optional[str]
    body_preview: Optional[str]
    received_at: datetime
    matched_filter_id: int
    is_read: bool
    is_archived: bool
    notified_at: Optional[datetime]
    created_at: datetime
    
    # Include filter name
    filter_name: Optional[str] = None
    connected_email_address: Optional[str] = None
    
    class Config:
        from_attributes = True


class FilteredEmailUpdate(BaseModel):
    """Update filtered email"""
    is_read: Optional[bool] = None
    is_archived: Optional[bool] = None


class EmailListResponse(BaseModel):
    """Paginated email list"""
    total: int
    page: int
    page_size: int
    items: List[FilteredEmailResponse]


# ===== Notification Preferences =====
class NotificationPreferenceUpdate(BaseModel):
    """Update notification preferences"""
    whatsapp_enabled: Optional[bool] = None
    email_digest_enabled: Optional[bool] = None
    email_digest_frequency: EmailDigestFrequency
    in_app_notifications: Optional[bool] = None


class NotificationPreferenceResponse(BaseModel):
    """Notification preference response"""
    id: int
    user_id: int
    whatsapp_enabled: bool
    email_digest_enabled: bool
    email_digest_frequency: EmailDigestFrequency
    in_app_notifications: bool
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ===== Google OAuth =====
class GoogleAuthURL(BaseModel):
    """Google OAuth authorization URL"""
    auth_url: str


class GoogleAuthCallback(BaseModel):
    """Google OAuth callback data"""
    code: str
    state: Optional[str] = None


# ===== Dashboard Stats =====
class DashboardStats(BaseModel):
    """Dashboard statistics"""
    total_connected_emails: int
    total_filters: int
    total_filtered_emails: int
    emails_today: int
    filters_matched_today: int
    recent_emails: List[FilteredEmailResponse]


# ===== Phone Verification Schemas =====
class PhoneVerificationRequest(BaseModel):
    """Request phone verification OTP"""
    phone_number: str = Field(..., description="Phone number in E.164 format (e.g., +1234567890)")


class PhoneVerificationVerify(BaseModel):
    """Verify phone OTP"""
    phone_number: str = Field(..., description="Phone number in E.164 format")
    code: str = Field(..., min_length=6, max_length=6)


# ===== Generic Responses =====
class MessageResponse(BaseModel):
    """Generic message response"""
    message: str
    success: bool = True


class ErrorResponse(BaseModel):
    """Error response"""
    detail: str
    error_code: Optional[str] = None
