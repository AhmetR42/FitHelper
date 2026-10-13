"""Fill the database with example data: `python -m app.seed`.

Adds a demo profile, eight weeks of workouts and weigh-ins. Existing data is
removed first, so only use this on a demo database.
"""

import random
from datetime import date, timedelta

from sqlmodel import Session, delete

from .database import create_tables, engine
from .models import Activity, Goal, Profile, Sex, WeightEntry, Workout

# (exercise, starting weight, weekly increase, reps)
PLAN = {
    0: [
        ("Bench press", 70, 2.5, 6),
        ("Barbell row", 60, 2.5, 8),
        ("Overhead press", 40, 1.25, 8),
        ("Lateral raise", 8, 0.5, 12),
    ],
    2: [
        ("Back squat", 90, 2.5, 5),
        ("Romanian deadlift", 80, 2.5, 8),
        ("Leg press", 140, 5, 10),
        ("Hip thrust", 80, 5, 10),
    ],
    4: [
        ("Deadlift", 120, 5, 5),
        ("Lat pulldown", 55, 2.5, 10),
        ("Bench press", 65, 2.5, 8),
        ("Barbell curl", 30, 1.25, 10),
    ],
}


def seed(session: Session, today: date | None = None, weeks: int = 8) -> None:
    today = today or date.today()
    rng = random.Random(42)
    for model in (Workout, WeightEntry, Profile):
        session.exec(delete(model))

    session.add(
        Profile(id=1, name="Sam", age=24, sex=Sex.male, height_cm=181, activity=Activity.moderate, goal=Goal.lose)
    )

    monday = today - timedelta(days=today.weekday()) - timedelta(weeks=weeks - 1)
    for week in range(weeks):
        for weekday, exercises in PLAN.items():
            day = monday + timedelta(weeks=week, days=weekday)
            if day > today or rng.random() < 0.1:
                continue  # a missed session now and then looks more real
            for name, start, step, reps in exercises:
                session.add(Workout(date=day, exercise=name, sets=4, reps=reps, weight_kg=start + step * week))

    weight = 86.4
    day = monday
    while day <= today:
        session.add(WeightEntry(date=day, weight_kg=round(weight, 1)))
        weight -= rng.uniform(0.05, 0.35)
        day += timedelta(days=3)

    session.commit()


if __name__ == "__main__":
    create_tables()
    with Session(engine) as db:
        seed(db)
    print("Demo data added.")
