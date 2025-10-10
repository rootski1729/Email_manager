"""
Schemas package
"""
from app.schemas.schemas import *

__all__ = [
    "OTPRequest", "OTPVerify", "TokenResponse", "TokenRefresh",
    "UserCreate", "UserUpdate", "UserResponse", "UserWithPlan",
    "PlanResponse", "UserPlanResponse",
    "ConnectedEmailCreate", "ConnectedEmailResponse",
    "EmailFilterCreate", "EmailFilterUpdate", "EmailFilterResponse",
    "FilteredEmailResponse", "FilteredEmailUpdate", "EmailListResponse",
    "NotificationPreferenceUpdate", "NotificationPreferenceResponse",
    "GoogleAuthURL", "GoogleAuthCallback",
    "DashboardStats", "MessageResponse", "ErrorResponse"
]
