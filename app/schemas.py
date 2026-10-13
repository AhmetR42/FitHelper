from pydantic import field_validator
from sqlmodel import SQLModel

from .models import Equipment, Level, Muscle, ProfileBase, WeightEntryBase, WorkoutBase


def clean_exercise(value: str) -> str:
    # "  bench   PRESS " and "Bench press" are the same exercise.
    return " ".join(value.split()).capitalize()


class ProfileIn(ProfileBase):
    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()


class ProfileOut(ProfileBase):
    pass


class WorkoutIn(WorkoutBase):
    @field_validator("exercise")
    @classmethod
    def normalise(cls, value: str) -> str:
        cleaned = clean_exercise(value)
        if not cleaned:
            raise ValueError("Exercise cannot be empty")
        return cleaned


class WorkoutOut(WorkoutBase):
    id: int
    volume: float
    e1rm: float


class WeightIn(WeightEntryBase):
    pass


class WeightOut(WeightEntryBase):
    id: int


class Body(SQLModel):
    weight_kg: float | None
    bmi: float | None
    bmi_category: str | None
    bmr: int | None
    daily_calories: int | None
    calorie_target: int | None
    weight_change_30d: float | None


class Summary(SQLModel):
    body: Body
    workouts_this_week: int
    volume_this_week: float
    streak_weeks: int
    total_workouts: int
    weekly_volume: list[dict]
    personal_records: list[dict]
    weight_history: list[dict]
    muscles_this_week: dict[str, int]


class Steps(SQLModel):
    en: list[str]
    nl: list[str]


class Tip(SQLModel):
    en: str
    nl: str


class ExerciseOut(SQLModel):
    slug: str
    name: str
    name_nl: str
    muscle: Muscle
    secondary: list[Muscle]
    equipment: Equipment
    level: Level
    unit: str
    demo: str
    steps: Steps
    tip: Tip
    favorite: bool
    video_url: str
    times_logged: int
    best_e1rm: float | None


class FavoriteIn(SQLModel):
    favorite: bool
