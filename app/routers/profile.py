from fastapi import APIRouter, HTTPException, status

from ..dependencies import SessionDep
from ..models import Profile
from ..schemas import ProfileIn, ProfileOut

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def read_profile(session: SessionDep):
    profile = session.get(Profile, 1)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No profile yet")
    return profile


@router.put("", response_model=ProfileOut)
def save_profile(data: ProfileIn, session: SessionDep):
    profile = session.get(Profile, 1) or Profile(id=1, **data.model_dump())
    profile.sqlmodel_update(data.model_dump())
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile
