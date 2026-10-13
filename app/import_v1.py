"""Import data from the first FitHelper (the console app).

    python -m app.import_v1 path/to/old/data

The folder should contain user.json, workouts.json and/or weights.json with
the Dutch keys the console app used (naam, leeftijd, gewicht, lengte, datum,
oefening, sets, reps). Missing files are skipped.
"""

import json
import sys
from datetime import date
from pathlib import Path

from sqlmodel import Session

from .database import create_tables, engine
from .models import Profile, Sex, WeightEntry, Workout
from .schemas import clean_exercise


def read(folder: Path, name: str):
    path = folder / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def import_folder(session: Session, folder: Path) -> dict:
    counts = {"profile": 0, "workouts": 0, "weights": 0}

    user = read(folder, "user.json")
    if user:
        # The old app did not ask for sex; it can be changed in the dashboard.
        session.merge(
            Profile(id=1, name=user["naam"], age=int(user["leeftijd"]), sex=Sex.male, height_cm=float(user["lengte"]))
        )
        counts["profile"] = 1

    for item in read(folder, "workouts.json") or []:
        session.add(
            Workout(
                date=date.fromisoformat(item["datum"]),
                exercise=clean_exercise(item["oefening"]),
                sets=int(item["sets"]),
                reps=int(item["reps"]),
                weight_kg=float(item["gewicht"]),
            )
        )
        counts["workouts"] += 1

    weights = read(folder, "weights.json") or []
    if not weights and user:
        # Without a weight history, keep the weight from the profile.
        weights = [{"datum": date.today().isoformat(), "gewicht": user["gewicht"]}]
    for item in weights:
        session.add(WeightEntry(date=date.fromisoformat(item["datum"]), weight_kg=float(item["gewicht"])))
        counts["weights"] += 1

    session.commit()
    return counts


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python -m app.import_v1 path/to/old/data")
    create_tables()
    with Session(engine) as db:
        result = import_folder(db, Path(sys.argv[1]))
    print(f"Imported {result['profile']} profile, {result['workouts']} workouts and {result['weights']} weigh-ins.")
