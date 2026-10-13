import json

from app.import_v1 import import_folder
from app.seed import seed

from .conftest import TODAY

PROFILE = {"name": "Ahmet", "age": 21, "sex": "male", "height_cm": 183, "activity": "moderate", "goal": "lose"}
WORKOUT = {"date": "2026-10-13", "exercise": "  bench   PRESS ", "sets": 4, "reps": 6, "weight_kg": 120}


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_dashboard_page_is_served(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "FitHelper" in response.text


def test_profile_can_be_created_and_updated(client):
    assert client.get("/api/profile").status_code == 404
    assert client.put("/api/profile", json=PROFILE).status_code == 200
    client.put("/api/profile", json={**PROFILE, "age": 22})
    assert client.get("/api/profile").json()["age"] == 22


def test_profile_is_validated(client):
    response = client.put("/api/profile", json={**PROFILE, "height_cm": 20, "sex": "robot"})
    assert response.status_code == 422
    fields = {error["loc"][-1] for error in response.json()["detail"]}
    assert fields == {"height_cm", "sex"}


def test_workout_crud(client):
    created = client.post("/api/workouts", json=WORKOUT)
    assert created.status_code == 201
    workout = created.json()
    assert workout["exercise"] == "Bench press"
    assert workout["volume"] == 2880
    assert workout["e1rm"] == 144

    updated = client.put(f"/api/workouts/{workout['id']}", json={**WORKOUT, "reps": 8}).json()
    assert updated["volume"] == 3840

    assert client.delete(f"/api/workouts/{workout['id']}").status_code == 204
    assert client.get("/api/workouts").json() == []
    assert client.delete(f"/api/workouts/{workout['id']}").status_code == 404


def test_workouts_can_be_filtered(client):
    client.post("/api/workouts", json=WORKOUT)
    client.post("/api/workouts", json={**WORKOUT, "exercise": "Squat", "date": "2026-10-01"})

    assert len(client.get("/api/workouts", params={"exercise": "bench press"}).json()) == 1
    assert len(client.get("/api/workouts", params={"from": "2026-10-05"}).json()) == 1
    assert client.get("/api/workouts/exercises").json() == ["Bench press", "Squat"]


def test_one_weigh_in_per_day(client):
    client.post("/api/weights", json={"date": "2026-10-13", "weight_kg": 90})
    client.post("/api/weights", json={"date": "2026-10-13", "weight_kg": 89.5})
    weights = client.get("/api/weights").json()
    assert len(weights) == 1
    assert weights[0]["weight_kg"] == 89.5


def test_summary_without_data(client):
    summary = client.get("/api/stats/summary").json()
    assert summary["body"]["bmi"] is None
    assert summary["total_workouts"] == 0
    assert len(summary["weekly_volume"]) == 8


def test_summary_with_data(client):
    client.put("/api/profile", json=PROFILE)
    client.post("/api/weights", json={"date": "2026-09-01", "weight_kg": 92})
    client.post("/api/weights", json={"date": "2026-10-13", "weight_kg": 90})
    client.post("/api/workouts", json=WORKOUT)
    client.post("/api/workouts", json={**WORKOUT, "exercise": "Squat", "weight_kg": 100})

    summary = client.get("/api/stats/summary").json()
    body = summary["body"]
    assert body["bmi"] == 26.9
    assert body["bmi_category"] == "overweight"
    assert body["calorie_target"] == body["daily_calories"] - 500
    assert body["weight_change_30d"] == -2
    assert summary["workouts_this_week"] == 1
    assert summary["volume_this_week"] == 2880 + 2400
    assert summary["personal_records"][0]["exercise"] == "Bench press"


def test_exercise_progress(client):
    client.post("/api/workouts", json=WORKOUT)
    client.post("/api/workouts", json={**WORKOUT, "date": "2026-10-06", "weight_kg": 110})
    history = client.get("/api/stats/exercise/BENCH PRESS").json()
    assert [point["date"] for point in history] == ["2026-10-06", "2026-10-13"]
    assert client.get("/api/stats/exercise/unknown").json() == []


def test_seed_creates_demo_data(client, session):
    seed(session, today=TODAY)
    summary = client.get("/api/stats/summary").json()
    assert summary["total_workouts"] > 10
    assert summary["streak_weeks"] >= 1
    assert summary["body"]["calorie_target"] is not None


def test_import_from_the_console_app(client, session, tmp_path):
    (tmp_path / "user.json").write_text(
        json.dumps({"naam": "Ahmet", "leeftijd": 21, "gewicht": 90.0, "lengte": 183.0}), encoding="utf-8"
    )
    (tmp_path / "workouts.json").write_text(
        json.dumps([{"datum": "2026-06-09", "oefening": "bench press", "sets": 4, "reps": 6, "gewicht": 120.0}]),
        encoding="utf-8",
    )

    counts = import_folder(session, tmp_path)
    assert counts == {"profile": 1, "workouts": 1, "weights": 1}
    assert client.get("/api/profile").json()["name"] == "Ahmet"
    assert client.get("/api/workouts").json()[0]["exercise"] == "Bench press"
