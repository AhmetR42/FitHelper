import re
from pathlib import Path

from app.library import LIBRARY, sync_library
from app.models import Exercise
from app.schemas import clean_exercise

DEMOS = Path(__file__).resolve().parent.parent / "static" / "js" / "demos.js"


def test_library_is_consistent():
    slugs = [entry.slug for entry in LIBRARY]
    assert len(slugs) == len(set(slugs))
    assert len(LIBRARY) >= 45
    for entry in LIBRARY:
        # Names must survive the clean-up the workout form applies, or logs would not match the library.
        assert clean_exercise(entry.name) == entry.name
        assert len(entry.steps_en) == len(entry.steps_nl) >= 3
        assert entry.muscle not in entry.secondary


def test_every_exercise_has_an_animation():
    defined = set(re.findall(r"^    (\w+): \{", DEMOS.read_text(encoding="utf-8"), re.MULTILINE))
    assert {entry.demo for entry in LIBRARY} <= defined


def test_list_and_filter(client):
    everything = client.get("/api/exercises").json()
    assert len(everything) == len(LIBRARY)
    bench = next(e for e in everything if e["slug"] == "bench-press")
    assert bench["steps"]["en"][0].startswith("Lie on the bench")
    assert bench["video_url"].startswith("https://www.youtube.com/results?search_query=how+to+do+bench+press")

    chest = client.get("/api/exercises", params={"muscle": "chest"}).json()
    assert {e["slug"] for e in chest} >= {"bench-press", "push-up", "bench-dip"}  # bench dip has chest as secondary

    beginner_dumbbell = client.get("/api/exercises", params={"equipment": "dumbbell", "level": "beginner"}).json()
    assert all(e["equipment"] == "dumbbell" and e["level"] == "beginner" for e in beginner_dumbbell)

    assert [e["slug"] for e in client.get("/api/exercises", params={"q": "bankdruk"}).json()] == ["bench-press"]
    assert client.get("/api/exercises", params={"muscle": "wings"}).status_code == 422


def test_favorites(client):
    assert client.put("/api/exercises/plank/favorite", json={"favorite": True}).json()["favorite"] is True
    assert [e["slug"] for e in client.get("/api/exercises", params={"favorites": True}).json()] == ["plank"]
    assert client.put("/api/exercises/nope/favorite", json={"favorite": True}).status_code == 404


def test_sync_keeps_favorites(session):
    exercise = session.get(Exercise, 1)
    exercise.favorite = True
    session.add(exercise)
    session.commit()
    sync_library(session)
    assert session.get(Exercise, 1).favorite is True


def test_logged_stats_and_muscles(client):
    day = {"date": "2026-10-13"}
    client.post("/api/workouts", json={**day, "exercise": "bench press", "sets": 3, "reps": 5, "weight_kg": 90})
    client.post("/api/workouts", json={**day, "exercise": "Zumba", "sets": 1, "reps": 1, "weight_kg": 0})

    bench = client.get("/api/exercises/bench-press").json()
    assert bench["times_logged"] == 1
    assert bench["best_e1rm"] == 105
    assert client.get("/api/exercises/missing").status_code == 404

    assert client.get("/api/stats/summary").json()["muscles_this_week"] == {"chest": 3, "other": 1}
