"""
Database seeder - Create initial plans
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models import Plan, PlanType


async def seed_plans():
    """Seed default subscription plans"""
    async with AsyncSessionLocal() as db:
        print("🌱 Seeding subscription plans...")
        
        # Check if plans already exist
        stmt = select(Plan)
        result = await db.execute(stmt)
        existing_plans = result.scalars().all()
        
        if existing_plans:
            print("✅ Plans already exist, skipping seed")
            return
        
        plans = [
            Plan(
                name=PlanType.FREE,
                max_emails=2,
                max_filters=5,
                price_monthly=0,
                features={
                    "in_app_notifications": True,
                    "whatsapp_notifications": False,
                    "email_digest": True,
                    "priority_support": False
                }
            ),
            Plan(
                name=PlanType.BASIC,
                max_emails=5,
                max_filters=20,
                price_monthly=500,  # $5.00
                features={
                    "in_app_notifications": True,
                    "whatsapp_notifications": True,
                    "whatsapp_daily_limit": 10,
                    "email_digest": True,
                    "priority_support": False
                }
            ),
            Plan(
                name=PlanType.PRO,
                max_emails=10,
                max_filters=999,  # Unlimited
                price_monthly=1200,  # $12.00
                features={
                    "in_app_notifications": True,
                    "whatsapp_notifications": True,
                    "whatsapp_daily_limit": 100,
                    "email_digest": True,
                    "priority_support": True,
                    "advanced_filters": True
                }
            ),
        ]
        
        db.add_all(plans)
        await db.commit()
        
        print("✅ Successfully seeded 3 subscription plans")
        print("   - FREE: 2 emails, 5 filters")
        print("   - BASIC: 5 emails, 20 filters ($5/month)")
        print("   - PRO: 10 emails, unlimited filters ($12/month)")


if __name__ == "__main__":
    asyncio.run(seed_plans())
