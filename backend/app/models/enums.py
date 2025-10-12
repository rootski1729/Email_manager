import enum


class PlanType(str, enum.Enum):
    """Subscription plan types"""
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"


class FilterType(str, enum.Enum):
    """Email filter types"""
    SENDER = "sender"
    SUBJECT = "subject"
    BODY = "body"
    CUSTOM = "custom"


class ActionType(str, enum.Enum):
    """Actions to perform on matched emails"""
    NOTIFY = "notify"
    WHATSAPP = "whatsapp"
    ARCHIVE = "archive"
    
class EmailDigestFrequency(str, enum.Enum):
    """Email digest frequency options"""
    DAILY = "daily"
    WEEKLY = "weekly"