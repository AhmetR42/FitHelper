from fastapi import APIRouter, HTTPException, Response, status
from sqlmodel import col, select

from ..dependencies import SessionDep
from ..models import WeightEntry
from ..schemas import WeightIn, WeightOut

router = APIRouter(prefix="/api/weights", tags=["weight"])


@router.get("", response_model=list[WeightOut])
def list_weights(session: SessionDep):
    return session.exec(select(WeightEntry).order_by(col(WeightEntry.date).desc())).all()


@router.post("", response_model=WeightOut, status_code=status.HTTP_201_CREATED)
def add_weight(data: WeightIn, session: SessionDep):
    # One weigh-in per day: a second one on the same day replaces the first.
    entry = session.exec(select(WeightEntry).where(WeightEntry.date == data.date)).first()
    if entry:
        entry.weight_kg = data.weight_kg
    else:
        entry = WeightEntry.model_validate(data)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weight(entry_id: int, session: SessionDep):
    entry = session.get(WeightEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Weight entry not found")
    session.delete(entry)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
