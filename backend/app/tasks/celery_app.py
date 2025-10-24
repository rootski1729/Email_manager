"""
Celery configuration
"""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "emailfilter",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=['app.tasks.email_processor']
)

# Celery configuration
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes
    task_soft_time_limit=240,  # 4 minutes
)

# Celery Beat Schedule (periodic tasks)
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    # Refresh expired OAuth tokens every hour
    'refresh-tokens-hourly': {
        'task': 'refresh_expired_tokens',
        'schedule': 3600.0,  # Every hour (in seconds)
    },
    # Send daily digest at 8 AM UTC
    'send-daily-digest': {
        'task': 'send_daily_digest',
        'schedule': crontab(hour=8, minute=0),  # 8:00 AM daily
    },
}

# Auto-discover tasks
celery_app.autodiscover_tasks(['app.tasks'])
