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

from routers import auth, cases, conversations, defendants, documents, messages, notifications  # noqa: E402

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
# CORS -- allow frontend origins
# ---------------------------------------------------------------------------

import os
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")

# Allowed origins — include the deployed Vercel site and common dev URLs.
# Note: you cannot combine "*" with allow_credentials=True (browsers reject it),
# so we use an explicit list that covers production and local development.
_allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]
if FRONTEND_URL:
    _allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    # Regex covers any Vercel preview URL + the custom FRONTEND_URL.
    # If you have a custom domain, add it to FRONTEND_URL env var in Railway.
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?",
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth.router,          prefix="/auth",          tags=["Auth"])
app.include_router(cases.router,         prefix="/cases",         tags=["Cases"])
app.include_router(conversations.router, prefix="/conversations", tags=["Conversations"])
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
    import os
    return {
        "status": "ok",
        "service": "LegalFlow API",
        "env": {
            "SUPABASE_URL": "set" if os.environ.get("SUPABASE_URL") else "MISSING",
            "SUPABASE_SERVICE_KEY": "set" if os.environ.get("SUPABASE_SERVICE_KEY") else "MISSING",
            "SUPABASE_ANON_KEY": "set" if os.environ.get("SUPABASE_ANON_KEY") else "MISSING",
            "ANTHROPIC_API_KEY": "set" if os.environ.get("ANTHROPIC_API_KEY") else "MISSING",
        },
    }


@app.get("/health", tags=["Health"])
async def health():
    """Railway healthcheck endpoint."""
    return {"status": "ok"}
