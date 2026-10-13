from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import Session, col, or_, select

from .. import fitness
from ..dependencies import SessionDep
from ..library import youtube_url
from ..models import Equipment, Exercise, Level, Muscle, Workout
from ..schemas import ExerciseOut, FavoriteIn, Steps, Tip

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


def logged_stats(session: Session) -> dict[str, tuple[int, float]]:
    """How often each exercise was logged and its best estimated 1RM, by lower-case name."""
    stats: dict[str, list] = defaultdict(lambda: [0, 0.0])
    for workout in session.exec(select(Workout)):
        entry = stats[workout.exercise.lower()]
        entry[0] += 1
        entry[1] = max(entry[1], fitness.estimated_one_rep_max(workout.weight_kg, workout.reps))
    return {name: (count, best) for name, (count, best) in stats.items()}


def to_out(exercise: Exercise, stats: dict[str, tuple[int, float]]) -> ExerciseOut:
    count, best = stats.get(exercise.name.lower(), (0, 0.0))
    return ExerciseOut(
        slug=exercise.slug,
        name=exercise.name,
        name_nl=exercise.name_nl,
        muscle=exercise.muscle,
        secondary=[Muscle(m) for m in exercise.secondary.split(",") if m],
        equipment=exercise.equipment,
        level=exercise.level,
        unit=exercise.unit,
        demo=exercise.demo,
        steps=Steps(en=exercise.steps_en.splitlines(), nl=exercise.steps_nl.splitlines()),
        tip=Tip(en=exercise.tip_en, nl=exercise.tip_nl),
        favorite=exercise.favorite,
        video_url=youtube_url(exercise.name),
        times_logged=count,
        best_e1rm=best or None,
    )


def get_exercise(slug: str, session: Session) -> Exercise:
    exercise = session.exec(select(Exercise).where(Exercise.slug == slug)).first()
    if exercise is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercise not found")
    return exercise


@router.get("", response_model=list[ExerciseOut])
def list_exercises(
    session: SessionDep,
    muscle: Muscle | None = None,
    equipment: Equipment | None = None,
    level: Level | None = None,
    q: Annotated[str | None, Query(max_length=60)] = None,
    favorites: bool = False,
):
    """The exercise library. Every filter is optional; `q` searches English and Dutch names."""
    query = select(Exercise)
    if muscle:
        query = query.where(or_(Exercise.muscle == muscle, col(Exercise.secondary).contains(muscle.value)))
    if equipment:
        query = query.where(Exercise.equipment == equipment)
    if level:
        query = query.where(Exercise.level == level)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(or_(col(Exercise.name).ilike(pattern), col(Exercise.name_nl).ilike(pattern)))
    if favorites:
        query = query.where(col(Exercise.favorite).is_(True))
    stats = logged_stats(session)
    return [to_out(exercise, stats) for exercise in session.exec(query.order_by(col(Exercise.id)))]


@router.get("/{slug}", response_model=ExerciseOut)
def read_exercise(slug: str, session: SessionDep):
    return to_out(get_exercise(slug, session), logged_stats(session))


@router.put("/{slug}/favorite", response_model=ExerciseOut)
def set_favorite(slug: str, data: FavoriteIn, session: SessionDep):
    exercise = get_exercise(slug, session)
    exercise.favorite = data.favorite
    session.add(exercise)
    session.commit()
    session.refresh(exercise)
    return to_out(exercise, logged_stats(session))
