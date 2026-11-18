import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import ml_service
from .config import settings
from .database import Base, engine
from .routes import router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from . import models  # noqa: F401  (registers tables)

    Base.metadata.create_all(bind=engine)
    ml_service.load_model()  # trains automatically if the model file is missing
    yield


app = FastAPI(title="PennyWise AI", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/api/health")
def health():
    from .ai_service import groq_configured

    return {"status": "ok", "groq_configured": groq_configured()}
