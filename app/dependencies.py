from datetime import date
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from .database import get_session


def get_today() -> date:
    """Today's date. Tests override this to get stable results."""
    return date.today()


SessionDep = Annotated[Session, Depends(get_session)]
TodayDep = Annotated[date, Depends(get_today)]
