from fastapi import APIRouter

from app.api.routes import auth, code, emotion, health, messages, models, profile, report, sessions


api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(emotion.router, prefix="/sessions", tags=["emotion"])
api_router.include_router(code.router, prefix="/sessions", tags=["code"])
api_router.include_router(messages.router, prefix="/sessions", tags=["messages"])
api_router.include_router(report.router, prefix="/sessions", tags=["report"])
api_router.include_router(models.router, tags=["models"])
