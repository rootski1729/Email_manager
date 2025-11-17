"""
API v1 router
"""
from fastapi import APIRouter
from app.api.v1 import auth, google, filters, emails, users, webhooks, phone, gmail_emails, payments

api_router = APIRouter()

# Include all routers
api_router.include_router(auth.router)
api_router.include_router(google.router)
api_router.include_router(filters.router)
api_router.include_router(emails.router)
api_router.include_router(gmail_emails.router)  # New Gmail direct fetch APIs
api_router.include_router(users.router)
api_router.include_router(webhooks.router)
api_router.include_router(phone.router)
api_router.include_router(payments.router)  # Razorpay payments
