"""
Authentication router.

Handles client registration by attorneys.  The attorney creates a
Supabase Auth account for the client, inserts a profile row, and
dispatches a welcome email.
"""

import logging
import os
import secrets
import string
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from utils.supabase_client import get_supabase
from utils.email_service import send_welcome_email

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Request schemas (local to this router)
# ---------------------------------------------------------------------------


class ClientRegisterRequest(BaseModel):
    """Body for POST /auth/register."""
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    address: Optional[str] = None
    county: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=2)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _generate_temp_password(length: int = 16) -> str:
    """Generate a secure temporary password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def _get_attorney_profile(authorization: str) -> dict:
    """Validate the bearer token and return the attorney's profile.

    Raises HTTPException 401 if the token is invalid or the user is not
    an attorney.
    """
    supabase = get_supabase()

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )

    token = authorization[len("Bearer "):]

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    profile_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
    )

    if not profile_resp.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Profile not found.",
        )

    profile = profile_resp.data[0]

    if profile["role"] != "attorney":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only attorneys can perform this action.",
        )

    return profile


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_client(
    body: ClientRegisterRequest,
    authorization: str = Header(...),
):
    """Attorney registers a new client.

    Creates a Supabase Auth user with a temporary password, inserts a
    profile with role ``client``, and sends a welcome email.
    """
    # Verify the caller is an attorney
    await _get_attorney_profile(authorization)

    supabase = get_supabase()

    # 1. Create auth user -------------------------------------------------
    temp_password = _generate_temp_password()

    try:
        auth_response = supabase.auth.admin.create_user(
            {
                "email": body.email,
                "password": temp_password,
                "email_confirm": True,
            }
        )
        new_user_id = str(auth_response.user.id)
    except Exception as exc:
        logger.exception("Failed to create auth user for %s", body.email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not create auth user: {exc}",
        )

    # 2. Create profile row -----------------------------------------------
    profile_payload = {
        "id": new_user_id,
        "role": "client",
        "full_name": body.full_name,
        "email": body.email,
        "phone": body.phone,
        "address": body.address,
        "county": body.county,
        "state": body.state,
    }

    try:
        profile_resp = (
            supabase.table("profiles")
            .insert(profile_payload)
            .execute()
        )
        if not profile_resp.data:
            raise RuntimeError("Profile insert returned no data.")
        profile = profile_resp.data[0]
    except Exception as exc:
        logger.exception("Failed to create profile for user %s", new_user_id)
        # Best-effort rollback: remove the auth user we just created
        try:
            supabase.auth.admin.delete_user(new_user_id)
        except Exception:
            logger.warning("Rollback: could not delete auth user %s", new_user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not create profile: {exc}",
        )

    # 3. Send welcome email (fire-and-forget) ------------------------------
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    login_url = f"{frontend_url}/login"
    await send_welcome_email(body.email, body.full_name, login_url)

    logger.info("Client registered: %s (%s)", body.full_name, body.email)
    return profile
