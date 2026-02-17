from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.profile import Profile
from app.schemas.profile import ProfileOut, ProfileUpdate
from app.utils.jwt import get_current_user


router = APIRouter()


@router.get("", response_model=ProfileOut)
def get_profile(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@router.put("", response_model=ProfileOut)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    if payload.experience_level is not None:
        profile.experience_level = payload.experience_level
    if payload.full_name is not None:
        profile.full_name = payload.full_name
    if payload.target_role is not None:
        profile.target_role = payload.target_role
    if payload.technologies is not None:
        profile.technologies = payload.technologies
    if payload.preferences is not None:
        profile.preferences = payload.preferences

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
