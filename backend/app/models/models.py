from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, Integer, Boolean, DateTime, Text, JSON, 
    ForeignKey, Index, Enum as SQLEnum, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from .enums import PlanType, FilterType, ActionType, EmailDigestFrequency

class User(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, unique=True, index=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))
    
    # Relationships
    user_plan: Mapped["UserPlan"] = relationship("UserPlan", back_populates="user", uselist=False)
    connected_emails: Mapped[list["ConnectedEmail"]] = relationship("ConnectedEmail", back_populates="user")
    filters: Mapped[list["EmailFilter"]] = relationship("EmailFilter", back_populates="user")
    filtered_emails: Mapped[list["FilteredEmail"]] = relationship("FilteredEmail", back_populates="user")
    notification_preference: Mapped["NotificationPreference"] = relationship(
        "NotificationPreference", back_populates="user", uselist=False
    )


class Plan(Base):
    __tablename__ = "plans"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[PlanType] = mapped_column(SQLEnum(PlanType), unique=True, nullable=False)
    max_emails: Mapped[int] = mapped_column(Integer, nullable=False)
    max_filters: Mapped[int] = mapped_column(Integer, nullable=False)
    price_monthly: Mapped[int] = mapped_column(Integer, default=0)  # in cents
    features: Mapped[dict] = mapped_column(JSON, default={})
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    
    # Relationships
    user_plans: Mapped[list["UserPlan"]] = relationship("UserPlan", back_populates="plan")


class UserPlan(Base):
    __tablename__ = "user_plans"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    plan_id: Mapped[int] = mapped_column(Integer, ForeignKey("plans.id"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="user_plan")
    plan: Mapped["Plan"] = relationship("Plan", back_populates="user_plans")
    
    __table_args__ = (
        Index("idx_user_plan_active", "user_id", "is_active"),
    )


class ConnectedEmail(Base):
    __tablename__ = "connected_emails"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    email_address: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    token_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    pubsub_topic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pubsub_subscription: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="connected_emails")
    filtered_emails: Mapped[list["FilteredEmail"]] = relationship("FilteredEmail", back_populates="connected_email")
    
    __table_args__ = (
        UniqueConstraint("user_id", "email_address", name="uq_user_email"),
        Index("idx_email_address", "email_address"),
        Index("idx_user_email_active", "user_id", "is_active"),
    )


class EmailFilter(Base):
    __tablename__ = "email_filters"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    filter_type: Mapped[FilterType] = mapped_column(SQLEnum(FilterType), nullable=False)
    conditions: Mapped[dict] = mapped_column(JSON, nullable=False)  # {sender, subject, body, etc.}
    action_type: Mapped[ActionType] = mapped_column(SQLEnum(ActionType), default=ActionType.NOTIFY)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    match_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="filters")
    filtered_emails: Mapped[list["FilteredEmail"]] = relationship("FilteredEmail", back_populates="matched_filter")
    
    __table_args__ = (
        Index("idx_user_filters_active", "user_id", "is_active"),
    )


class FilteredEmail(Base):
    __tablename__ = "filtered_emails"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    connected_email_id: Mapped[int] = mapped_column(Integer, ForeignKey("connected_emails.id"), nullable=False)
    gmail_message_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    gmail_thread_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sender: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body_preview: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    matched_filter_id: Mapped[int] = mapped_column(Integer, ForeignKey("email_filters.id"), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="filtered_emails")
    connected_email: Mapped["ConnectedEmail"] = relationship("ConnectedEmail", back_populates="filtered_emails")
    matched_filter: Mapped["EmailFilter"] = relationship("EmailFilter", back_populates="filtered_emails")
    
    __table_args__ = (
        Index("idx_user_emails", "user_id", "received_at"),
        Index("idx_gmail_message", "gmail_message_id"),
    )


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    email_digest_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    email_digest_frequency: Mapped[EmailDigestFrequency] = mapped_column(SQLEnum(EmailDigestFrequency), default=EmailDigestFrequency.WEEKLY)
    in_app_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notification_preference")


class UsageMetric(Base):
    """Daily usage metrics per user"""
    __tablename__ = "usage_metrics"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    emails_processed: Mapped[int] = mapped_column(Integer, default=0)
    filters_matched: Mapped[int] = mapped_column(Integer, default=0)
    api_calls: Mapped[int] = mapped_column(Integer, default=0)
    whatsapp_sent: Mapped[int] = mapped_column(Integer, default=0)
    
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_date"),
        Index("idx_user_date", "user_id", "date"),
    )


# Note: OTP codes are stored in Redis with 2-minute expiry, not in database
