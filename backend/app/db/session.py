import logging
import time

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


logger = logging.getLogger(__name__)


def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def _is_postgres(url: str) -> bool:
    return url.startswith("postgresql")


def _build_engine(url: str):
    connect_args = {"check_same_thread": False} if _is_sqlite(url) else {}
    return create_engine(url, pool_pre_ping=True, connect_args=connect_args)


def _can_connect(engine) -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except OperationalError:
        return False
    except Exception:  # noqa: BLE001
        return False
    return True


def _init_engine():
    primary_url = settings.database_url
    engine = _build_engine(primary_url)

    if _is_postgres(primary_url):
        for attempt in range(1, settings.db_connect_retries + 1):
            if _can_connect(engine):
                return engine
            logger.info("Postgres not ready (attempt %s)", attempt)
            time.sleep(settings.db_connect_delay_seconds)

        logger.warning(
            "Postgres not reachable; falling back to sqlite at %s",
            settings.sqlite_fallback_url,
        )
        return _build_engine(settings.sqlite_fallback_url)

    return engine


engine = _init_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
