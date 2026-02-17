from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api import api_router
from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="AI Interview Coach API", version="0.1.0")

    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
