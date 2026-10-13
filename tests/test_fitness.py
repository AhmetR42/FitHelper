from datetime import date
from types import SimpleNamespace as W

from app import fitness


def test_bmi_and_category():
    assert fitness.bmi(90, 183) == 26.9
    assert fitness.bmi_category(18.4) == "underweight"
    assert fitness.bmi_category(24.9) == "healthy"
    assert fitness.bmi_category(29.9) == "overweight"
    assert fitness.bmi_category(30) == "obese"


def test_calories_with_mifflin_st_jeor():
    assert fitness.bmr(80, 180, 25, "male") == 1805
    assert fitness.bmr(60, 165, 30, "female") == 1320
    assert fitness.daily_calories(1805, "moderate") == 2798
    assert fitness.calorie_target(2798, "lose") == 2298
    assert fitness.calorie_target(2798, "gain") == 3098


def test_volume_and_one_rep_max():
    assert fitness.volume(4, 6, 120) == 2880
    assert fitness.estimated_one_rep_max(100, 1) == 100
    assert fitness.estimated_one_rep_max(100, 5) == 116.7


def test_weekly_volume_groups_by_monday():
    workouts = [
        W(date=date(2026, 10, 12), sets=1, reps=10, weight_kg=100),  # Monday this week
        W(date=date(2026, 10, 18), sets=1, reps=10, weight_kg=50),  # Sunday this week
        W(date=date(2026, 10, 11), sets=2, reps=5, weight_kg=10),  # Sunday last week
        W(date=date(2025, 1, 1), sets=1, reps=1, weight_kg=999),  # too old
    ]
    weeks = fitness.weekly_volume(workouts, date(2026, 10, 14), weeks=3)
    assert [w["week"] for w in weeks] == ["2026-09-28", "2026-10-05", "2026-10-12"]
    assert [w["volume"] for w in weeks] == [0, 100, 1500]


def test_personal_records_keep_the_best_set():
    workouts = [
        W(date=date(2026, 10, 1), exercise="Squat", weight_kg=100, reps=5),
        W(date=date(2026, 10, 8), exercise="Squat", weight_kg=110, reps=1),
        W(date=date(2026, 10, 8), exercise="Bench press", weight_kg=80, reps=8),
    ]
    records = fitness.personal_records(workouts)
    assert [r["exercise"] for r in records] == ["Squat", "Bench press"]
    assert records[0]["e1rm"] == 116.7
    assert records[0]["date"] == "2026-10-01"


def test_streak_counts_weeks_in_a_row():
    today = date(2026, 10, 14)
    days = {date(2026, 10, 6), date(2026, 10, 1), date(2026, 9, 22), date(2026, 9, 1)}
    # Nothing yet this week, so the streak counts the three weeks before it.
    # The workout on 1 September is after a gap, so it does not count.
    assert fitness.training_streak(days, today) == 3
    assert fitness.training_streak(days | {today}, today) == 4
    assert fitness.training_streak(set(), today) == 0


def test_exercise_history_takes_best_set_per_day():
    workouts = [
        W(date=date(2026, 10, 1), exercise="Squat", weight_kg=100, reps=5),
        W(date=date(2026, 10, 1), exercise="Squat", weight_kg=90, reps=5),
        W(date=date(2026, 10, 8), exercise="Squat", weight_kg=105, reps=5),
        W(date=date(2026, 10, 8), exercise="Deadlift", weight_kg=200, reps=5),
    ]
    assert fitness.exercise_history(workouts, "Squat") == [
        {"date": "2026-10-01", "e1rm": 116.7},
        {"date": "2026-10-08", "e1rm": 122.5},
    ]
