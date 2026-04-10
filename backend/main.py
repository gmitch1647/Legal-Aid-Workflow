"""
LegalFlow API -- FastAPI backend for the Legal Aid Workflow CRM platform.

Serves as the entry-point for the application.  Registers all routers,
configures CORS, and loads environment variables via python-dotenv.
"""

import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before any other application imports so that every module
# sees the environment variables it expects.
load_dotenv()

from routers import auth, cases, defendants, documents, messages, notifications  # noqa: E402

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="LegalFlow API",
    description="Backend API for the Legal Aid Workflow CRM platform.",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS -- allow all origins for development; tighten for production
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth.router,          prefix="/auth",          tags=["Auth"])
app.include_router(cases.router,         prefix="/cases",         tags=["Cases"])
app.include_router(defendants.router,    prefix="/defendants",    tags=["Defendants"])
app.include_router(documents.router,                              tags=["Documents"])
app.include_router(messages.router,                               tags=["Messages"])
app.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])

# ---------------------------------------------------------------------------
# Root health-check
# ---------------------------------------------------------------------------


@app.get("/", tags=["Health"])
async def root():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "LegalFlow API"}
