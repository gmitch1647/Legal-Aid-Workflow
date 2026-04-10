"""
Supabase client initialisation.

Loads credentials from environment variables (via .env) and exposes a
ready-to-use service-role client via ``get_supabase()``.
"""

import os
import logging

from dotenv import load_dotenv

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

_client = None


def get_supabase():
    """Return the shared Supabase service-role client, creating it on first call."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            raise RuntimeError(
                "Cannot initialise Supabase client: "
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set as "
                "environment variables in your Railway service settings."
            )
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.info("Supabase service-role client initialised.")
    return _client
