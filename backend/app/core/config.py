from typing import List
from pydantic_settings import BaseSettings
from pydantic import PostgresDsn, RedisDsn, validator


class Settings(BaseSettings):
    # App
    APP_NAME: str = "EmailFilter Pro"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    SECRET_KEY: str
    
    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 0
    
    # Redis
    REDIS_URL: str
    REDIS_SESSION_DB: int = 1  #for user session
    REDIS_CACHE_DB: int = 2
    REDIS_CELERY_DB: int = 3
    
    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Encryption
    ENCRYPTION_KEY: str
    
    # Google OAuth
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str
    GOOGLE_PROJECT_ID: str
    GOOGLE_PUBSUB_TOPIC: str
    
    # WAHA (WhatsApp HTTP API) - replaces Twilio
    WAHA_API_URL: str = "http://localhost:3000/api"
    WAHA_API_KEY: str = ""
    WAHA_SESSION_NAME: str = "default"
    
    # Legacy Twilio (deprecated - kept for backward compatibility)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = "whatsapp:+14155238886"  # Twilio sandbox number
    
    # Email
    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    EMAILS_FROM_EMAIL: str
    
    # Celery
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    WEBHOOK_RATE_LIMIT: int = 1000
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = []
    
    #DOCS
    IS_DOCS: bool = False
    
    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v
    
    # Sentry
    SENTRY_DSN: str = ""
    
    # Feature Flags
    ENABLE_WHATSAPP_NOTIFICATIONS: bool = False
    ENABLE_EMAIL_DIGESTS: bool = True
    ENABLE_SIGNUP: bool = True
    
    # WhatsApp OTP Authentication
    WHATSAPP_OTP_ENABLED: bool = True  # Set to False to disable WhatsApp OTP
    WHATSAPP_OTP_EXPIRY_MINUTES: int = 2  # OTP expires in 2 minutes
    WHATSAPP_OTP_LENGTH: int = 6  # 6-digit OTP
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
