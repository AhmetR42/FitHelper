from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlmodel import Session, col, select

from .. import fitness
from ..dependencies import SessionDep
from ..models import Workout
from ..schemas import WorkoutIn, WorkoutOut

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


def to_out(workout: Workout) -> WorkoutOut:
    return WorkoutOut(
        **workout.model_dump(),
        volume=fitness.volume(workout.sets, workout.reps, workout.weight_kg),
        e1rm=fitness.estimated_one_rep_max(workout.weight_kg, workout.reps),
    )


def get_workout(workout_id: int, session: Session) -> Workout:
    workout = session.get(Workout, workout_id)
    if workout is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workout not found")
    return workout


@router.get("", response_model=list[WorkoutOut])
def list_workouts(
    session: SessionDep,
    exercise: str | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    query = select(Workout)
    if exercise:
        query = query.where(col(Workout.exercise).ilike(exercise.strip()))
    if date_from:
        query = query.where(Workout.date >= date_from)
    if date_to:
        query = query.where(Workout.date <= date_to)
    query = query.order_by(col(Workout.date).desc(), col(Workout.id).desc()).limit(limit)
    return [to_out(workout) for workout in session.exec(query)]


@router.get("/exercises", response_model=list[str])
def list_exercises(session: SessionDep):
    """Every exercise name used so far, for suggestions in the form."""
    return sorted(set(session.exec(select(Workout.exercise))))


@router.post("", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
def create_workout(data: WorkoutIn, session: SessionDep):
    workout = Workout.model_validate(data)
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return to_out(workout)


@router.put("/{workout_id}", response_model=WorkoutOut)
def update_workout(workout_id: int, data: WorkoutIn, session: SessionDep):
    workout = get_workout(workout_id, session)
    workout.sqlmodel_update(data.model_dump())
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return to_out(workout)


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(workout_id: int, session: SessionDep):
    session.delete(get_workout(workout_id, session))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
