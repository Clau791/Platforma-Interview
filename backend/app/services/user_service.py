from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.user import User


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, email: str, password_hash: str) -> User:
    user = User(email=email, password_hash=password_hash)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_profile(
    db: Session,
    user_id: str,
    full_name: str | None = None,
    experience_level: str | None = None,
    target_role: str | None = None,
    technologies: list[str] | None = None,
) -> Profile:
    profile = Profile(
        user_id=user_id,
        full_name=full_name,
        experience_level=experience_level,
        target_role=target_role,
        technologies=technologies or [],
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
