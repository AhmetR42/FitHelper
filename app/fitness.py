"""Fitness calculations.

Plain functions with no database or web code, so they are easy to test.
"""

from collections import defaultdict
from datetime import date, timedelta

ACTIVITY_FACTORS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

GOAL_ADJUSTMENT = {"lose": -500, "maintain": 0, "gain": 300}


def bmi(weight_kg: float, height_cm: float) -> float:
    meters = height_cm / 100
    return round(weight_kg / (meters**2), 1)


def bmi_category(value: float) -> str:
    """Return a key the frontend translates (WHO categories)."""
    if value < 18.5:
        return "underweight"
    if value < 25:
        return "healthy"
    if value < 30:
        return "overweight"
    return "obese"


def bmr(weight_kg: float, height_cm: float, age: int, sex: str) -> int:
    """Basal metabolic rate with the Mifflin-St Jeor formula."""
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return round(base + (5 if sex == "male" else -161))


def daily_calories(bmr_value: int, activity: str) -> int:
    return round(bmr_value * ACTIVITY_FACTORS[activity])


def calorie_target(tdee: int, goal: str) -> int:
    return tdee + GOAL_ADJUSTMENT[goal]


def volume(sets: int, reps: int, weight_kg: float) -> float:
    return round(sets * reps * weight_kg, 1)


def estimated_one_rep_max(weight_kg: float, reps: int) -> float:
    """Epley formula. One rep is the weight itself."""
    if reps <= 1:
        return round(weight_kg, 1)
    return round(weight_kg * (1 + reps / 30), 1)


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def weekly_volume(workouts, today: date, weeks: int = 8) -> list[dict]:
    """Total volume per week (Monday to Sunday) for the last `weeks` weeks, oldest first."""
    current = week_start(today)
    starts = [current - timedelta(weeks=i) for i in reversed(range(weeks))]
    totals = dict.fromkeys(starts, 0.0)
    for workout in workouts:
        start = week_start(workout.date)
        if start in totals:
            totals[start] += volume(workout.sets, workout.reps, workout.weight_kg)
    return [{"week": start.isoformat(), "volume": round(total, 1)} for start, total in totals.items()]


def personal_records(workouts) -> list[dict]:
    """Best estimated one-rep max per exercise, highest first."""
    best = {}
    for workout in workouts:
        e1rm = estimated_one_rep_max(workout.weight_kg, workout.reps)
        current = best.get(workout.exercise)
        if current is None or e1rm > current["e1rm"]:
            best[workout.exercise] = {
                "exercise": workout.exercise,
                "weight_kg": workout.weight_kg,
                "reps": workout.reps,
                "e1rm": e1rm,
                "date": workout.date.isoformat(),
            }
    return sorted(best.values(), key=lambda record: record["e1rm"], reverse=True)


def training_streak(days: set[date], today: date) -> int:
    """Number of weeks in a row (up to this week) with at least one workout."""
    weeks = {week_start(day) for day in days}
    streak = 0
    current = week_start(today)
    if current not in weeks:
        current -= timedelta(weeks=1)  # this week can still be ahead of you
    while current in weeks:
        streak += 1
        current -= timedelta(weeks=1)
    return streak


def exercise_history(workouts, exercise: str) -> list[dict]:
    """Best estimated one-rep max per day for one exercise, oldest first."""
    per_day = defaultdict(float)
    for workout in workouts:
        if workout.exercise == exercise:
            e1rm = estimated_one_rep_max(workout.weight_kg, workout.reps)
            per_day[workout.date] = max(per_day[workout.date], e1rm)
    return [{"date": day.isoformat(), "e1rm": value} for day, value in sorted(per_day.items())]
