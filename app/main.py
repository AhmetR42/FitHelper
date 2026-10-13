from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .database import create_tables, engine
from .dependencies import SessionDep
from .library import sync_library
from .routers import exercises, profile, stats, weights, workouts

STATIC = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    with Session(engine) as session:
        sync_library(session)
    yield


app = FastAPI(
    title="FitHelper API",
    description="Track workouts, body weight and progress. The web dashboard uses this same API.",
    version="2.1.0",
    lifespan=lifespan,
)

for router in (profile.router, workouts.router, weights.router, stats.router, exercises.router):
    app.include_router(router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.post("/api/demo", tags=["meta"], status_code=201)
def load_demo_data(session: SessionDep):
    """Replace everything with example data, so a visitor can try the dashboard."""
    from .seed import seed

    seed(session)
    return {"status": "demo data loaded"}


class StaticFilesNoCache(StaticFiles):
    # Browsers must check for a newer file, so an update never mixes old CSS with new HTML.
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


app.mount("/static", StaticFilesNoCache(directory=STATIC), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})
