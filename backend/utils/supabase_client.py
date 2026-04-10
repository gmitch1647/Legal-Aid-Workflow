"""
Supabase client initialisation.

Loads credentials from environment variables (via .env) and exposes a
ready-to-use service-role client as well as the raw URL / anon key for
situations that require them (e.g. client-side auth helpers).
"""

import os
import logging

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

logger = logging.getLogger(__name__)

# ── Required environment variables ──────────────────────────────────────────

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.environ.get("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY: str = os.environ.get("SUPABASE_ANON_KEY", "")

if not SUPABASE_URL:
    logger.warning("SUPABASE_URL is not set – Supabase calls will fail.")
if not SUPABASE_SERVICE_KEY:
    logger.warning("SUPABASE_SERVICE_KEY is not set – Supabase calls will fail.")

# ── Client singleton ────────────────────────────────────────────────────────

_client: Client | None = None


def get_supabase() -> Client:
    """Return the shared Supabase service-role client, creating it on first call."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "Cannot initialise Supabase client: "
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set."
            )
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.info("Supabase service-role client initialised.")
    return _client


# Convenience alias so callers can do `from utils.supabase_client import supabase`
supabase: Client = None  # type: ignore[assignment]


def _ensure_module_level_client() -> None:
    """Attempt to populate the module-level `supabase` alias at import time."""
    global supabase
    try:
        supabase = get_supabase()
    except RuntimeError:
        # Env vars missing – leave as None; callers should use get_supabase()
        pass


_ensure_module_level_client()
