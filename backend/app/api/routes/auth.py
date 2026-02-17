from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.services.user_service import create_profile, create_user, get_user_by_email
from app.utils.jwt import create_access_token
from app.utils.security import hash_password, verify_password


router = APIRouter()


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account already exists",
        )

    user = create_user(db, payload.email, hash_password(payload.password))
    create_profile(
        db,
        user_id=str(user.id),
        full_name=payload.full_name,
        experience_level=payload.experience_level,
        target_role=payload.target_role,
        technologies=payload.technologies,
    )
    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token)
