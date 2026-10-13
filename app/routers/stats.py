from datetime import date, timedelta

from fastapi import APIRouter
from sqlmodel import Session, col, select

from .. import fitness
from ..dependencies import SessionDep, TodayDep
from ..models import Exercise, Profile, WeightEntry, Workout
from ..schemas import Body, Summary

router = APIRouter(prefix="/api/stats", tags=["stats"])


def body_stats(profile: Profile | None, weights: list[WeightEntry], today: date) -> Body:
    current = weights[-1].weight_kg if weights else None
    change = None
    if current is not None:
        cutoff = today - timedelta(days=30)
        older = [entry for entry in weights if entry.date <= cutoff]
        start = older[-1] if older else weights[0]
        change = round(current - start.weight_kg, 1)

    if profile is None or current is None:
        return Body(
            weight_kg=current,
            bmi=None,
            bmi_category=None,
            bmr=None,
            daily_calories=None,
            calorie_target=None,
            weight_change_30d=change,
        )

    bmi = fitness.bmi(current, profile.height_cm)
    bmr = fitness.bmr(current, profile.height_cm, profile.age, profile.sex.value)
    tdee = fitness.daily_calories(bmr, profile.activity.value)
    return Body(
        weight_kg=current,
        bmi=bmi,
        bmi_category=fitness.bmi_category(bmi),
        bmr=bmr,
        daily_calories=tdee,
        calorie_target=fitness.calorie_target(tdee, profile.goal.value),
        weight_change_30d=change,
    )


@router.get("/summary", response_model=Summary)
def summary(session: SessionDep, today: TodayDep):
    workouts = session.exec(select(Workout)).all()
    weights = session.exec(select(WeightEntry).order_by(col(WeightEntry.date))).all()
    this_week = [w for w in workouts if fitness.week_start(w.date) == fitness.week_start(today)]

    return Summary(
        body=body_stats(session.get(Profile, 1), weights, today),
        workouts_this_week=len({w.date for w in this_week}),
        volume_this_week=round(sum(fitness.volume(w.sets, w.reps, w.weight_kg) for w in this_week), 1),
        streak_weeks=fitness.training_streak({w.date for w in workouts}, today),
        total_workouts=len({w.date for w in workouts}),
        weekly_volume=fitness.weekly_volume(workouts, today),
        personal_records=fitness.personal_records(workouts)[:6],
        weight_history=[{"date": e.date.isoformat(), "weight_kg": e.weight_kg} for e in weights[-60:]],
        muscles_this_week=muscle_sets(session, this_week),
    )


def muscle_sets(session: Session, workouts: list[Workout]) -> dict[str, int]:
    """Sets per main muscle group. Exercises that are not in the library count as "other"."""
    muscles = {exercise.name.lower(): exercise.muscle.value for exercise in session.exec(select(Exercise))}
    sets: dict[str, int] = {}
    for workout in workouts:
        muscle = muscles.get(workout.exercise.lower(), "other")
        sets[muscle] = sets.get(muscle, 0) + workout.sets
    return dict(sorted(sets.items(), key=lambda item: -item[1]))


@router.get("/exercise/{name}")
def exercise(name: str, session: SessionDep):
    """Progress of one exercise: best estimated one-rep max per day."""
    workouts = session.exec(select(Workout).where(col(Workout.exercise).ilike(name.strip()))).all()
    return fitness.exercise_history(workouts, workouts[0].exercise) if workouts else []
