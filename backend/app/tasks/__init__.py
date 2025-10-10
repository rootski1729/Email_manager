"""
Tasks package
"""
from app.tasks.celery_app import celery_app
from app.tasks.email_processor import process_new_email

__all__ = ["celery_app", "process_new_email"]
