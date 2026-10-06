"""The admin console API (/api/v1/admin/*). Every route requires an admin account."""

from fastapi import APIRouter

from app.api.admin import auth, clients, config, data, system, tools

router = APIRouter()
for module in (auth, system, clients, config, tools, data):
    router.include_router(module.router)
