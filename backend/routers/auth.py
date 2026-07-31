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


class StaffAttorneyRegisterRequest(BaseModel):
    """Body for POST /auth/invite-attorney."""
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    address: Optional[str] = None
    bar_number: Optional[str] = None
    firm_name: Optional[str] = None


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


# ---------------------------------------------------------------------------
# POST /invite-attorney — admin invites a staff attorney
# ---------------------------------------------------------------------------

@router.post("/invite-attorney", status_code=status.HTTP_201_CREATED)
async def invite_staff_attorney(
    body: StaffAttorneyRegisterRequest,
    authorization: str = Header(...),
):
    """Admin attorney invites a staff attorney to the platform."""
    await _get_attorney_profile(authorization)

    supabase = get_supabase()
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
        logger.exception("Failed to create auth user for attorney %s", body.email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not create account: {exc}",
        )

    try:
        profile = supabase.table("profiles").insert(
            {
                "id": new_user_id,
                "email": body.email,
                "full_name": body.full_name,
                "phone": body.phone,
                "address": body.address,
                "bar_number": body.bar_number,
                "firm_name": body.firm_name,
                "role": "staff_attorney",
            }
        ).execute()
    except Exception as exc:
        logger.exception("Failed to create staff attorney profile")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Profile creation failed: {exc}",
        )

    # Send welcome email with credentials
    email_sent = False
    try:
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
        from utils.email_service import send_email
        email_sent = await send_email(
            to=body.email,
            subject="You've been invited to LegalFlow",
            body=f"""
            <div style="font-family:sans-serif;font-size:14px;line-height:1.6;">
                <h2>Welcome to LegalFlow, {body.full_name}!</h2>
                <p>You've been invited to join the LegalFlow platform as a staff attorney.</p>
                <p><strong>Login URL:</strong> <a href="{frontend_url}/login">{frontend_url}/login</a></p>
                <p><strong>Email:</strong> {body.email}</p>
                <p><strong>Temporary Password:</strong> {temp_password}</p>
                <p>Please change your password after your first login.</p>
            </div>
            """,
        )
    except Exception as e:
        logger.error(f"Failed to send invite email to {body.email}: {e}")

    from utils.email_service import get_last_email_error
    email_error = None if email_sent else get_last_email_error()

    logger.info("Staff attorney invited: %s (%s), email_sent=%s, error=%s", body.full_name, body.email, email_sent, email_error)
    return {
        "profile": profile.data[0] if profile.data else None,
        "temp_password": temp_password,
        "email_sent": email_sent,
        "email_error": email_error,
        "message": f"Staff attorney {body.full_name} created.{' Welcome email sent.' if email_sent else ' Email failed — share the password manually.'}",
    }


# ---------------------------------------------------------------------------
# GET /staff-attorneys — list all staff attorneys
# ---------------------------------------------------------------------------

@router.get("/staff-attorneys")
async def list_staff_attorneys(authorization: str = Header(...)):
    """List all staff attorneys."""
    await _get_attorney_profile(authorization)

    supabase = get_supabase()
    resp = supabase.table("profiles").select("id, full_name, email, phone, address, bar_number, firm_name, created_at").eq("role", "staff_attorney").order("full_name").execute()

    # Get last sign-in for each attorney from auth
    attorneys = resp.data or []
    for atty in attorneys:
        try:
            user = supabase.auth.admin.get_user_by_id(atty["id"])
            atty["last_sign_in_at"] = user.user.last_sign_in_at if user.user else None
        except Exception:
            atty["last_sign_in_at"] = None

    return attorneys


# ---------------------------------------------------------------------------
# POST /staff-attorneys/{id}/resend-invite — resend welcome email
# ---------------------------------------------------------------------------

@router.post("/staff-attorneys/{attorney_id}/resend-invite")
async def resend_staff_invite(attorney_id: str, authorization: str = Header(...)):
    await _get_attorney_profile(authorization)
    supabase = get_supabase()

    profile_resp = supabase.table("profiles").select("email, full_name, role").eq("id", attorney_id).limit(1).execute()
    if not profile_resp.data:
        # Try by email in case ID doesn't match
        logger.warning(f"Resend invite: profile not found by ID {attorney_id}")
        raise HTTPException(status_code=404, detail=f"Attorney not found with ID: {attorney_id}")

    atty = profile_resp.data[0]
    temp_password = _generate_temp_password()

    # Reset their password
    try:
        supabase.auth.admin.update_user_by_id(attorney_id, {"password": temp_password})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not reset password: {e}")

    # Send email with new credentials
    email_sent = False
    try:
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
        from utils.email_service import send_email
        email_sent = await send_email(
            to=atty["email"],
            subject="Your LegalFlow Invite (Resent)",
            body=f"""
            <div style="font-family:sans-serif;font-size:14px;line-height:1.6;">
                <h2>Welcome to LegalFlow, {atty["full_name"]}!</h2>
                <p>Your login credentials have been reset. Use the details below to sign in:</p>
                <p><strong>Login URL:</strong> <a href="{frontend_url}/login">{frontend_url}/login</a></p>
                <p><strong>Email:</strong> {atty["email"]}</p>
                <p><strong>Temporary Password:</strong> {temp_password}</p>
                <p>Please change your password after your first login.</p>
            </div>
            """,
        )
    except Exception as e:
        logger.error(f"Failed to resend invite email to {atty['email']}: {e}")

    from utils.email_service import get_last_email_error
    email_error = None if email_sent else get_last_email_error()

    return {
        "status": "sent" if email_sent else "password_reset_only",
        "temp_password": temp_password,
        "email": atty["email"],
        "email_sent": email_sent,
        "email_error": email_error,
    }


# ---------------------------------------------------------------------------
# PATCH /staff-attorneys/{id} — update a staff attorney
# ---------------------------------------------------------------------------

@router.patch("/staff-attorneys/{attorney_id}")
async def update_staff_attorney(
    attorney_id: str,
    body: dict,
    authorization: str = Header(...),
):
    await _get_attorney_profile(authorization)
    supabase = get_supabase()

    allowed = {k: v for k, v in body.items() if k in ('full_name', 'email', 'phone', 'address', 'bar_number', 'firm_name')}
    if not allowed:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    resp = supabase.table("profiles").update(allowed).eq("id", attorney_id).eq("role", "staff_attorney").execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Attorney not found")
    return resp.data[0]


# ---------------------------------------------------------------------------
# DELETE /staff-attorneys/{id} — remove a staff attorney
# ---------------------------------------------------------------------------

@router.delete("/staff-attorneys/{attorney_id}")
async def delete_staff_attorney(
    attorney_id: str,
    authorization: str = Header(...),
):
    await _get_attorney_profile(authorization)
    supabase = get_supabase()

    # Unassign from any clients
    try:
        supabase.table("profiles").update({"assigned_attorney_id": None}).eq("assigned_attorney_id", attorney_id).execute()
    except Exception:
        pass

    # Delete profile
    supabase.table("profiles").delete().eq("id", attorney_id).eq("role", "staff_attorney").execute()

    # Delete auth user
    try:
        supabase.auth.admin.delete_user(attorney_id)
    except Exception:
        pass

    return {"deleted": True}


# ---------------------------------------------------------------------------
# POST /assign-attorney — assign a staff attorney to a client
# ---------------------------------------------------------------------------

class AssignAttorneyRequest(BaseModel):
    client_id: str
    attorney_id: str


@router.post("/assign-attorney")
async def assign_attorney_to_client(
    body: AssignAttorneyRequest,
    authorization: str = Header(...),
):
    """Assign a staff attorney to a client."""
    await _get_attorney_profile(authorization)

    supabase = get_supabase()
    resp = supabase.table("profiles").update(
        {"assigned_attorney_id": body.attorney_id}
    ).eq("id", body.client_id).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="Client not found")

    return {"assigned": True, "client_id": body.client_id, "attorney_id": body.attorney_id}
