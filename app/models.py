from datetime import date as Date
from enum import StrEnum

from sqlmodel import Field, SQLModel


class Sex(StrEnum):
    male = "male"
    female = "female"


class Activity(StrEnum):
    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    very_active = "very_active"


class Goal(StrEnum):
    lose = "lose"
    maintain = "maintain"
    gain = "gain"


class Muscle(StrEnum):
    chest = "chest"
    back = "back"
    shoulders = "shoulders"
    arms = "arms"
    legs = "legs"
    glutes = "glutes"
    core = "core"
    cardio = "cardio"


class Equipment(StrEnum):
    barbell = "barbell"
    dumbbell = "dumbbell"
    kettlebell = "kettlebell"
    machine = "machine"
    cable = "cable"
    bodyweight = "bodyweight"


class Level(StrEnum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class ProfileBase(SQLModel):
    name: str = Field(min_length=1, max_length=60)
    age: int = Field(ge=10, le=100)
    sex: Sex
    height_cm: float = Field(ge=100, le=250)
    activity: Activity = Activity.moderate
    goal: Goal = Goal.maintain


class Profile(ProfileBase, table=True):
    # There is one profile per installation, always with id 1.
    id: int | None = Field(default=None, primary_key=True)


class WorkoutBase(SQLModel):
    date: Date
    exercise: str = Field(min_length=1, max_length=60)
    sets: int = Field(ge=1, le=50)
    reps: int = Field(ge=1, le=100)
    weight_kg: float = Field(ge=0, le=500)
    notes: str = Field(default="", max_length=300)


class Workout(WorkoutBase, table=True):
    id: int | None = Field(default=None, primary_key=True)


class WeightEntryBase(SQLModel):
    date: Date
    weight_kg: float = Field(ge=30, le=300)


class WeightEntry(WeightEntryBase, table=True):
    id: int | None = Field(default=None, primary_key=True)


class Exercise(SQLModel, table=True):
    """One exercise from the library (see app/library.py)."""

    id: int | None = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    name: str
    name_nl: str
    muscle: Muscle = Field(index=True)
    secondary: str = ""  # comma separated muscles
    equipment: Equipment
    level: Level
    unit: str = "reps"  # "reps" or "seconds"
    demo: str
    steps_en: str  # one step per line
    steps_nl: str
    tip_en: str
    tip_nl: str
    favorite: bool = False
