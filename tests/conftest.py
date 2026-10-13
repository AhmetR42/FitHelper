from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.dependencies import get_today
from app.library import sync_library
from app.main import app

TODAY = date(2026, 10, 14)  # a Wednesday


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        sync_library(db)
        yield db


@pytest.fixture
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_today] = lambda: TODAY
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
