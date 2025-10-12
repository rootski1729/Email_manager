"""
Models package
"""
from app.models.models import (
    User, Plan, UserPlan, ConnectedEmail, EmailFilter,
    FilteredEmail, NotificationPreference, UsageMetric
)
from app.models.enums import (
    PlanType, FilterType, ActionType, EmailDigestFrequency
)

__all__ = [
    "User", "Plan", "UserPlan", "ConnectedEmail", "EmailFilter",
    "FilteredEmail", "NotificationPreference", "UsageMetric",
    "PlanType", "FilterType", "ActionType", "EmailDigestFrequency"
]
